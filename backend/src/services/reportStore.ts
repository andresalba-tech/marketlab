export type ReportMimeType = "text/csv" | "image/svg+xml";

export type StoredReport = {
  id: string;
  filename: string;
  content: string;
  mimeType: ReportMimeType;
};

type ReportInput = Omit<StoredReport, "mimeType"> & {
  mimeType?: ReportMimeType;
};

const reports = new Map<string, StoredReport>();

export function saveReport(report: ReportInput): void {
  reports.set(report.id, {
    ...report,
    mimeType: report.mimeType ?? "text/csv",
  });
}

export function getReport(id: string): StoredReport | undefined {
  return reports.get(id);
}