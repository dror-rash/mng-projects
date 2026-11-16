import { deleteAttachmentAction } from "@/features/attachments/actions";
import { AttachmentUploader } from "@/features/attachments/attachment-uploader";
import { listProjectReports } from "@/features/attachments/queries";
import { ReportsSection } from "@/features/attachments/reports-section";

import type { PageProject } from "./types";

/** The Reports tab (task 122): the project's reports. */
export async function ReportsTab({ userId, project }: { userId: string; project: PageProject }) {
  const reports = await listProjectReports(userId, project.id);
  return (
    <ReportsSection
      projectId={project.id}
      reports={reports}
      uploader={project.canWork ? <AttachmentUploader visitId={null} kinds={["report"]} /> : undefined}
      deleteAction={project.canWork ? deleteAttachmentAction : undefined}
    />
  );
}
