export type StoredReport = {
  id: string;
  filename: string;
  content: string;
};

const reports = new Map<string, StoredReport>();

export function saveReport(report: StoredReport): void {
  reports.set(report.id, report);
}

export function getReport(id: string): StoredReport | undefined {
  return reports.get(id);
}