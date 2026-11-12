#!/usr/bin/env node
// What row-level security depends on, pinned (task 068, check-runtime-role.mjs): the views app_user reads, the
// SECURITY DEFINER functions it may run (the access functions the policies call), the SECURITY DEFINER trigger
// functions (triggers fire without EXECUTE), and every policy. Each is a sha256 of its definition as Postgres
// deparses it with search_path pinned (pg-safe.mjs), so every name is schema-qualified. A hash, not "does it
// still call its access function": a redefinition can call it and return every row anyway (`… or true`).
//
// A migration that adds or changes one of these fails the deploy until its hash here is updated on purpose;
// the failure prints the new hash. To print the whole list from a migrated database:
//   DATABASE_URL=… node --experimental-strip-types infra/scripts/rls-pins.mjs --print
// A Postgres version that deparses differently fails safe the same way (CI pins the image, ci.yml).
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { buildPoolConfig, RUNTIME_ROLE } from "../../packages/db/src/pool-config.ts";
import { Client, pinSearchPath, withPinnedSearchPath } from "./pg-safe.mjs";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "pg_toast"];

/** Whether `hash` matches `pin`: one hash, or a list (one per Postgres minor that deparses differently). */
export const pinMatches = (pin, hash) => pin !== undefined && [].concat(pin).includes(hash);

/**
 * The pinnable objects in the database `client` is connected to, with their hashes. Owners are part of the
 * hash (a SECURITY DEFINER function or a view runs with its owner's rights, and a table's owner bypasses
 * row-level security unless it is forced):
 *   views, every function (whatever its security: an invoker overload can hijack a definer function's
 *   untyped call), definer triggers, policies, and every table's owner and RLS/FORCE flags.
 * `definerExecutable`: the functions that are SECURITY DEFINER and app_user may run.
 */
export async function readPinnable(client, role = RUNTIME_ROLE) {
  await pinSearchPath(client);
  // Owners differ per environment (app, preview_owner, postgres locally): the login that ran the migrations
  // (it created drizzle's table) is hashed as <migrator>, any other owner by name.
  const migratorRow = await client.query(
    `select pg_catalog.pg_get_userbyid(c.relowner)::text as name
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'drizzle' and c.relname = '__drizzle_migrations'`,
  );
  const migrator = migratorRow.rows[0]?.name;
  const owner = (name) => (name === migrator ? "<migrator>" : name);
  const views = await client.query(
    `select n.nspname || '.' || c.relname as key, pg_catalog.pg_get_userbyid(c.relowner)::text as owner,
            coalesce(pg_catalog.array_to_string(c.reloptions, ','), '') as options, pg_catalog.pg_get_viewdef(c.oid) as definition
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'v' and n.nspname <> all ($1::text[]) order by 1`,
    [SYSTEM_SCHEMAS],
  );
  const functions = await client.query(
    `select p.oid::pg_catalog.regprocedure::text as key, pg_catalog.pg_get_userbyid(p.proowner)::text as owner, p.prokind::text as kind,
            case when p.prokind <> 'a' then pg_catalog.pg_get_functiondef(p.oid) else '' end as definition,
            p.prosecdef and pg_catalog.has_function_privilege($1::text::pg_catalog.name, p.oid, 'EXECUTE') as definer_executable
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname <> all ($2::text[])
       and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
                       and d.objid = p.oid and d.deptype = 'e')
     order by 1`,
    [role, SYSTEM_SCHEMAS],
  );
  const triggers = await client.query(
    `select n.nspname || '.' || c.relname || ' ' || t.tgname || ' ' || t.tgfoid::pg_catalog.regprocedure::text as key,
            pg_catalog.pg_get_userbyid(p.proowner)::text as owner, pg_catalog.pg_get_functiondef(t.tgfoid) as definition
     from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace join pg_catalog.pg_proc p on p.oid = t.tgfoid
     where not t.tgisinternal and p.prosecdef and n.nspname <> all ($1::text[]) order by 1`,
    [SYSTEM_SCHEMAS],
  );
  const policies = await client.query(
    `select schemaname || '.' || tablename || '/' || policyname as key, cmd, permissive, roles::text[] as roles, qual, with_check
     from pg_catalog.pg_policies where schemaname <> all ($1::text[]) order by 1`,
    [SYSTEM_SCHEMAS],
  );
  const tables = await client.query(
    `select n.nspname || '.' || c.relname as key, pg_catalog.pg_get_userbyid(c.relowner)::text as owner,
            c.relrowsecurity as rls, c.relforcerowsecurity as force
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p') and n.nspname <> all ($1::text[]) order by 1`,
    [SYSTEM_SCHEMAS],
  );
  const hashed = (rows, hash) => Object.fromEntries(rows.map((row) => [row.key, hash(row)]));
  return {
    views: hashed(views.rows, (v) => sha256(`${v.options}\n${v.definition}\nowner=${owner(v.owner)}`)),
    functions: hashed(functions.rows, (f) => sha256(`${f.kind}\n${f.definition}\nowner=${owner(f.owner)}`)),
    triggers: hashed(triggers.rows, (t) => sha256(`${t.definition}\nowner=${owner(t.owner)}`)),
    policies: hashed(policies.rows, (p) => sha256(JSON.stringify([p.cmd, p.permissive, [...p.roles].sort(), p.qual, p.with_check]))),
    tables: hashed(tables.rows, (t) => sha256(JSON.stringify([owner(t.owner), t.rls, t.force]))),
    definerExecutable: functions.rows.filter((f) => f.definer_executable).map((f) => f.key),
  };
}

/**
 * The pins, from the migrations (printed with --print from a database migrated up to 0037, Postgres 16.15).
 * A value may be a list of hashes when another Postgres minor (Cloud SQL's) deparses an object differently.
 */
export const PINS = {
  views: {
    "public.customer_name": "ee252de29d2b660f62216c0be55fa697d048bc57eaa95360e7d63053f1c20245",
    "public.site_choice": "fe51a264e794e41f2c2a21f2a8fa12594431aac81f0d8b65c93ff6c43f16e7f2",
  },
  functions: {
    "public.access_role(text,text)": "e2b10131f703b552aa86408102e3fdb96488ed05413abbb77b09d9f10e19050c",
    "public.attachment_check()": "00f251bbf30aa56159fa39403e200ac2e7d5965b032611c5dc548b8bd7e7680c",
    "public.can_change_attachment(text,text)": "ca4790624c9e1119b966de313993f772761cfb1067832e0667fcf183720fcf9e",
    "public.can_change_customer(text,text)": "53af7733c45470729e515d5cff3e0b76d9a3d6e04a02661b121a43ec160d086a",
    "public.can_change_form_template(text,text)": "4eb706bb2ff3f1694b80ef6e0e3bd37f9febd8f6b8c1747f91905dc8c179f7ee",
    "public.can_change_form_version(text,text)": "6b62a231c1889b33bdf819f7f044c24727f15be9d9fd8b41f947e5890847a5e9",
    "public.can_change_project(text,text)": "be4ca232ce7c10e74e47c7e49af8946831bc49ce11b9ed3a288e1cfeb0412ef4",
    "public.can_change_site(text,text)": "4d2749e6dd961bfb15da1af404f8f27674e73fe05335c3c44a03a06acf8dce30",
    "public.can_change_visit(text,text)": "f0124fa33491ed82004cc3dcc395afa86e87b620d14608346aee34f4cc7e8fc5",
    "public.can_fill_reading(text,text,text)": "7b14c828193c49895dc3adf06f8e3883f5e6b82c1e801692bfffe3f0e2fada47",
    "public.can_see_customer_name(text,text)": "47336aa5517efb8da8086e2f1c15a24d68e889e3c72151852f1d2e41c1a7a8fa",
    "public.can_see_customer(text,text)": "60d427ec8e3dd1d26eba84353b8646cd8a0b083b9931d299eb772bf4fd9bba80",
    "public.can_see_form_template(text,text)": "736c54976184660fd2563ae9188eded87dba012f22ef176c073b5568a0c60a08",
    "public.can_see_form_version(text,text)": "94642a641ac61ae5fa93165e428d37c1b7c046946a8d0d20ca9f88ca1aefb74f",
    "public.can_see_project(text,text)": "2edfcedc588b6a4832f7dd88ba506cf15b05110189b090024a671e0c2d29fdb7",
    "public.can_see_site(text,text)": "50616e9460e5e47796ba3117cadc5c34add0f137c23cea2e76b11c8cfaa1c14e",
    "public.can_work_on_project(text,text)": "27ff63048a91edcc3726b93b4d8dffc10be3a0133ab67329f6eb960325b56ff6",
    "public.clear_assignments(text,text)": "80e4a9bd6501b2dfc4786aeeebe6981ebe7976cd6b7858a5dddfc711e1ad07c8",
    "public.clear_unseen_assignments(text,text)": "11f0cf494f7c62abe8fb44bb10da47336dd4940efdae53cf016d60082743a584",
    "public.create_workspace(text,text)": "88fabcdf87acf09592933a4eddef0ddc1ec019418ea88c1b6a45d980a5affaae",
    "public.delete_attachment(text)": "f22f2f891130371452066cb2a14c213d82e7d2c491c7c67d6b5f726b05b90d0e",
    "public.delete_task(text)": "cac54c16f2ba278a6eaa02b78a035a030c47856bbc0a807cb77f38b7b78fd9b1",
    "public.delete_visit(text)": "28dc681706d4f06a981be5df0af352197ff7fcada23c350fcd18789dadb2b989",
    "public.find_invite(text)": "b8e6b6b3f12614b8a6b3fc20a1950b09b61df3e1716ec5824899744a1c603cc4",
    "public.form_field_check()": "10f61224754ebb4a56b5745148473a95bac24d45eb383517d3dc8552c306767e",
    "public.form_submission_keep()": "99ac2b1550f825d3951aa3ecfdf509b6a046665ac5cf7500119968acb70f46ca",
    "public.form_template_check()": "389f4c2fc378a257c8efe5306f0416625e9cf6af004685d5d7d0cc00c3022110",
    "public.form_template_publish()": "7d8073cdf3ee716f7df9989b1aab14cf068d93ee725c22653ff396a6859eea3c",
    "public.form_template_version_check()": "a9fcb14348cff214192c310e49b0208fdf775a0b39ff8722b978df0685f2346a",
    "public.has_workspace_role(text,text,text[])": "2cc5f3410863fee593122b82b29fda8a0b6d554cf31f228003675079ba954518",
    "public.is_on_crew(text,text)": "499449ab1ec586a9ba299cb20217d20964acb2e396b9f26c1ee0f754417cf052",
    "public.is_project_person(text,text)": "3ad41513e4844ae6fc8381b8affe4bc68d15939770477443179357b466c0b6d2",
    "public.join_workspace(text,text)": "321ad6298d4e4aeae80dc6aac208bfb45911bfc48cadbedf34580967f6d84866",
    "public.organization_parent_check()": "0e18fffc7d5ef750cf39529795d4e4f04314fdc96700d170eb192107267e35ed",
    "public.partner_serves_customer(text,text)": "551eb78b16ce53e619b594eac7fc2dad219eb860d8cea84944b03f975b6cf144",
    "public.project_site_check()": "97c67a45b81c6cadc03408323b588e211d1cc582e2a6b06b850ed541d49ce678",
    "public.project_worker_check()": "23f4e4deeb363a6a0b95f8e3fd7cd0e8ebe8f616a1c18b1f529286fba4d6a7b2",
    "public.project_worker_clear_assignments()": "72ba55687805261b3c2b67964079b6606577f6235c5b4d320b8b5ed7fae28072",
    "public.restore_project(text)": "60e9f63bf3902a33145a2779d73128594436d9283c55bf910cb772ebb9fb8c7d",
    "public.site_visit_keep_project()": "82b0279831ec946f119d0d3ba15e62e156a13a8da6495d2b104e6a1ee26464e1",
    "public.workspace_member_leave_crews()": "45f770c4dc7558da824d462da126b66a34a09e85173d950c0953727d2c60bc43",
  },
  triggers: {
    "public.attachment attachment_check public.attachment_check()": "3f2ebd35f6a77405fb706744a236249a31f57f51228bb46dd4b43005d7ed264b",
    "public.form_field form_field_check public.form_field_check()": "03ae931c5f7fa501b610856d0c85e526e1eb6dc778f7fde62c34e5498edfa9b5",
    "public.form_template form_template_check public.form_template_check()": "935db77ec7bc4eddbac8b006ead5ab94db2cad8ccbf9203560f13cb098e1a5e2",
    "public.form_template form_template_publish public.form_template_publish()": "963a4ca89d547d8e48b4ef27de62013605c3ed182a6d9acb3643cc26d89179bc",
    "public.form_template_version form_template_version_check public.form_template_version_check()": "eee4801b15cfbc17c501de5b2edb7e47779266b040227dec79747dfe5e384204",
    "public.organization organization_parent_check public.organization_parent_check()": "f94ffb40dced092ee1c5841c253817aa703c6286d8bf39080fbec54cc5ebbe0b",
    "public.project project_site_check public.project_site_check()": "506ded4277182003c6c55ed46f7c0316337b6db6077c2c103f730d05f53a02c5",
    "public.project_worker project_worker_check public.project_worker_check()": "79ab02b733339d9025786977e9fd253ce5e68bd7c92761b38d00fb937d942346",
    "public.project_worker project_worker_clear_assignments public.project_worker_clear_assignments()": "8815012b00657f533d90706b72599ff75262a1a3e3e022497b905eabbf8e70bd",
    "public.site_visit site_visit_keep_project public.site_visit_keep_project()": "993f07b01cfd85d0ace05a7ca3a542744b50117258a0350303013e7e5cbd519d",
    "public.workspace_member workspace_member_leave_crews public.workspace_member_leave_crews()": "fa3e985a4b611ce5e3da1b43efdb9d6a48a508c052cc33b81b6586b4a68d26de",
  },
  policies: {
    "public.attachment/attachment_delete": "e29276d3053d78c1b4b1d730e1b0855195a12c94d5419e0e09ec60aab65df10d",
    "public.attachment/attachment_insert": "28427fb17fb36c6c065ce3ebe991add8f6060d8b4dde8e12d417400a99ae6dae",
    "public.attachment/attachment_select": "ac68df6fe4166990f4822b99ef4179f59a8fe8b93fcf624521892b34a1b34a88",
    "public.attachment/attachment_update": "d6eebec4286ad09c7c54176d4963e22e4395a2d6855bc9d9f146218d2168acc9",
    "public.customer_partner/customer_partner_select": "513725896b39e6451e731405f8961c582b62851d64471e9585550f7185797191",
    "public.customer_partner/customer_partner_write": "8b0d06d36e131123dc3db1c9b3636ea0316926de91dd98c8586dd2748c25e649",
    "public.form_field/form_field_select": "ec7f0f25c5fa1deed816850ea9f341c8a640c7e43f9512570ba87d22c50ebb70",
    "public.form_field/form_field_write": "551adabab44713b8473bd0ef962a946f8e7f1bdd97b0ee8f3443b1dcb98e5357",
    "public.form_submission/form_submission_insert": "619beae042f9e184a9a557241d6276d41566524c9a8abe8e85f6a1ee2dd25b76",
    "public.form_submission/form_submission_select": "c4b3a0678d586507b81e3fbc60d5100e5382ff1b464afdc4b2442bc1b9c2ed98",
    "public.form_template/form_template_insert": "9cf37a3f8de53f5686c8d1c50a8447d43bf63289139da1e637dbc0cb48215e9a",
    "public.form_template/form_template_select": "59ea38c7ab8a5bd1f7b1380dd2b63661148e6a6318287f5a106c64f95819a18f",
    "public.form_template/form_template_update": "7c666c4ff8a20628ffed5930c9f5a52fd97a65593b2b9663257ad1f14f327925",
    "public.form_template_version/form_template_version_delete": "b31e62f7586493ac98a849448dcb2cbb5e0249615ae6c47ef0717e78930469b8",
    "public.form_template_version/form_template_version_insert": "f60ba2ddfbc965d632b33e1d8fcd7a8b0322051c9b577aed2c7298dac0f21736",
    "public.form_template_version/form_template_version_select": "618857c6cd25f592e2dd6ebd5ad364aeceeaa3c49a60267b2e78cde22e21626b",
    "public.form_template_version/form_template_version_update": "42552b09d5b7ba340c81ece914ce33b0b991ceb7c0e1fd115f20dd99f310cf03",
    "public.organization/organization_delete": "c4cdabbfaf4d41b3131915fd1e01a239968ae3de86d75296571276d6d8ca3f9f",
    "public.organization/organization_insert": "b834f0490da5b0888b8ca53c3af049b3e8024a406bbd7d7d9a91b36545dfc8c3",
    "public.organization/organization_select": "ef84ef965952ee91dfe8e20d8630450bb42e19beaf5cb336ddff65a73f10e04a",
    "public.organization/organization_update": "ea6cfcece560ec18720165878ea48714e5c32e263bdad7a87b11965f5e982b08",
    "public.organization_contact/organization_contact_select": "ecdb685c731fb473c81c988325fc6cbe4079f760f3679e92ba9a6ac0bf93055a",
    "public.organization_contact/organization_contact_write": "8ddd0c4be5cf8817fa4780d6ede6848ddd53283b53e175ce0659e830be1aff8d",
    "public.organization_note/organization_note_select": "ecdb685c731fb473c81c988325fc6cbe4079f760f3679e92ba9a6ac0bf93055a",
    "public.organization_note/organization_note_write": "8ddd0c4be5cf8817fa4780d6ede6848ddd53283b53e175ce0659e830be1aff8d",
    "public.partner/partner_select": "87b6e8be9381eb867aec56cda1937c4e5059e3b6061501a5132f3dd725b5f819",
    "public.partner/partner_write": "8b0d06d36e131123dc3db1c9b3636ea0316926de91dd98c8586dd2748c25e649",
    "public.project/project_delete": "a5c91745d7b5fb3fb8ebb889565da54784e2e9f179a9ac498036dd3d6166cf56",
    "public.project/project_insert": "712fc3a8cf934f3800630a68b5191a29d0f5aa25d58fc346fefd02df4caa87a5",
    "public.project/project_select": "e3c217a7b51615f902e4f1f930368724c2612ed98994de3cf7a1c62feb9b66c2",
    "public.project/project_update": "bf149e439728ef64e6044d824bb1e968610f2b842c7747225e2a3d872fdba80f",
    "public.project_worker/project_worker_select": "235a12558fb9a74e5aecaeb5ff6e0b61f0523c06e6dc0c797df4ac9e5e95c1c0",
    "public.project_worker/project_worker_write": "8b0d06d36e131123dc3db1c9b3636ea0316926de91dd98c8586dd2748c25e649",
    "public.site/site_delete": "b43cb2b4569eec8a60e60eb03caa87fd98dd045bbaf37d32ad58531264a81bb4",
    "public.site/site_insert": "b834f0490da5b0888b8ca53c3af049b3e8024a406bbd7d7d9a91b36545dfc8c3",
    "public.site/site_select": "d99d8a3c8f86d7a7c467c7634307678e87a9eb1b0cf4fcb5a01a4d990d4266bd",
    "public.site/site_update": "fa26ade3bbc3252355c0f49672dd4e77574bf692d001238582177344dcce7fc7",
    "public.site_contact/site_contact_select": "de71046aa181d4b5f10735dd3ddad703ec17b111900b56129b3c3c98478eb03d",
    "public.site_contact/site_contact_write": "ae2fddc754b083a9584355358d68d68a3ad646d25dbcdff632ad8014aa3b400e",
    "public.site_visit/site_visit_insert": "fe0394234c50d225ad68cea2702095042dee11fb068cd069576e1fb7a4fab73b",
    "public.site_visit/site_visit_select": "433e77b620c4ac14b06fa553d175d622261ef4fd0dcb57b2422a27d540ef1635",
    "public.site_visit/site_visit_update": "baae14a2759094d816234ea7e715cf5567eed1d6fb619a7660341ca073236720",
    "public.site_visit_member/site_visit_member_select": "76c3745084ac93011f5b7359561c7d5d009bc3cf557d3f8600f83603d674da4f",
    "public.site_visit_member/site_visit_member_write": "cc8b05db5ff94b9de0f8e8ad0778e372b845871df55d8936926cfda0dc0f46f1",
    "public.task/task_delete": "7afe731f320b9b7fc8e1ccc86d874ece0ec0233f6ba360cf53aa61aef269d750",
    "public.task/task_insert": "bf062816a93c4ef0664a25eb92332622648e9b7135cdd74484662db3df0dbf6d",
    "public.task/task_select": "e0f45a34451ed680edf80442e0ef5f4b85b2b2ce09d436e3d56e067d1be749fe",
    "public.task/task_update": "6e13706b510e12e19a9ba5da07e645b3656ca656f41bb5bdf194a96b85070742",
    "public.workspace/workspace_delete": "4c7b3cc26a6d225cdc5a465dc2023fcf1c7a2182c2e47b588613f95784f1669e",
    "public.workspace/workspace_insert": "3353d06b148789aae02efb3fd0d438bc6054e2526174142fe7e749971a80a520",
    "public.workspace/workspace_select": "5adc65d2955efc3a6cc4b1a76d52b9524bf237bb2c84764ee30597fd9f50847f",
    "public.workspace/workspace_update": "07e983470dc45ca10e52d789733608216c0cca91b8fdc2f8600163bd022072d8",
    "public.workspace_invite/workspace_invite_admin": "8b0d06d36e131123dc3db1c9b3636ea0316926de91dd98c8586dd2748c25e649",
    "public.workspace_member/workspace_member_leave": "5d55c97d89b974338cc2b7a97c94ad544b3629e4f7e074242a4a797c4e7581f6",
    "public.workspace_member/workspace_member_select": "43549ad0dc92de3e231811a579b0213d8fd5ede9f18165e8a6df757d75c09ab8",
    "public.workspace_member/workspace_member_write": "8b0d06d36e131123dc3db1c9b3636ea0316926de91dd98c8586dd2748c25e649",
  },
  tables: {
    "drizzle.__drizzle_migrations": "652f462889aae25b5f96a709cecb4e8553767d8f2fc12ed5b1873260aa997885",
    "public.account": "652f462889aae25b5f96a709cecb4e8553767d8f2fc12ed5b1873260aa997885",
    "public.attachment": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.customer_partner": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.form_field": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.form_submission": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.form_template": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.form_template_version": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.organization": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.organization_contact": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.organization_note": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.partner": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.project": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.project_worker": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.rate_limit": "652f462889aae25b5f96a709cecb4e8553767d8f2fc12ed5b1873260aa997885",
    "public.session": "652f462889aae25b5f96a709cecb4e8553767d8f2fc12ed5b1873260aa997885",
    "public.sign_in_lockout": "652f462889aae25b5f96a709cecb4e8553767d8f2fc12ed5b1873260aa997885",
    "public.site": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.site_contact": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.site_visit": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.site_visit_member": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.task": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.user": "652f462889aae25b5f96a709cecb4e8553767d8f2fc12ed5b1873260aa997885",
    "public.verification": "652f462889aae25b5f96a709cecb4e8553767d8f2fc12ed5b1873260aa997885",
    "public.workspace": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.workspace_invite": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
    "public.workspace_member": "1e10232c9f6542fd14ba2555dcbb8e21205927f39a191aff300e1fb527721702",
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--print")) {
  const client = new Client(withPinnedSearchPath(buildPoolConfig(process.env, null)));
  await client.connect();
  try {
    const { definerExecutable, ...pins } = await readPinnable(client);
    console.log(JSON.stringify(pins, null, 2));
  } finally {
    await client.end();
  }
}
