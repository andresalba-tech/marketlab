import { Router } from "express";
import { getReport } from "../services/reportStore.js";

export const reportsRouter = Router();

reportsRouter.get("/:id/download", (req, res) => {
  const report = getReport(req.params.id);

  if (report === undefined) {
    res.status(404).json({
      error: "Reporte no encontrado.",
    });
    return;
  }

  res.attachment(report.filename);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.send(report.content);
});