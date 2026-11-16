import { isAdmin } from "@/features/access/require-change";
import { deleteAttachmentAction } from "@/features/attachments/actions";
import { AttachmentUploader } from "@/features/attachments/attachment-uploader";
import { AttachmentsSection } from "@/features/attachments/attachments-section";
import { listProjectAttachments } from "@/features/attachments/queries";
import { removeCrewMemberAction } from "@/features/crews/actions";
import { AddToCrewForm } from "@/features/crews/add-to-crew-form";
import { CrewSection } from "@/features/crews/crew-section";
import { listCrew, listCrewChoices } from "@/features/crews/queries";
import { listProjectReadings } from "@/features/readings/queries";
import { ReadingsSection } from "@/features/readings/readings-section";
import { listProjectVisits } from "@/features/visits/queries";
import { VisitsSection } from "@/features/visits/visits-section";

import type { PageProject } from "./types";

/** The Work tab (task 122): the field work, its visits, readings, photos and files, and who does it. */
export async function WorkTab({ userId, project }: { userId: string; project: PageProject }) {
  const [visits, readings, attachments, crew, manageCrew] = await Promise.all([
    listProjectVisits(userId, project.id),
    listProjectReadings(userId, project.id),
    listProjectAttachments(userId, project.id),
    listCrew(userId, project.id),
    isAdmin(userId, project.workspaceId),
  ]);
  // Admins put the workspace's workers on the crew (task 056).
  const crewChoices = manageCrew ? await listCrewChoices(userId, project) : [];

  return (
    <>
      <VisitsSection projectId={project.id} visits={visits} canRecord={project.canWork} />

      <ReadingsSection projectId={project.id} readings={readings} showVisitDates />

      <AttachmentsSection
        projectId={project.id}
        items={attachments}
        showVisits
        uploader={project.canWork ? <AttachmentUploader visitId={null} /> : undefined}
        deleteAction={project.canWork ? deleteAttachmentAction : undefined}
      />

      <CrewSection
        projectId={project.id}
        crew={crew}
        removeAction={manageCrew ? removeCrewMemberAction : undefined}
        addForm={manageCrew ? <AddToCrewForm projectId={project.id} workers={crewChoices} /> : undefined}
      />
    </>
  );
}
