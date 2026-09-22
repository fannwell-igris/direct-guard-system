import { Router } from "express";
import * as controller from "./operations.controller";

const router = Router();

// GET   /api/operations/coverage-summary   - coverage % per record,
//                                             filterable + paginated (MUST
//                                             stay registered before /:id
//                                             so Express doesn't treat
//                                             "coverage-summary" as an id)
// GET   /api/operations/attendance-calendar - per-employee, per-day
//                                             attendance grid for a date
//                                             range (dateFrom+dateTo
//                                             required, max ~2 months;
//                                             optional siteId/clientId/
//                                             employeeId). Also MUST stay
//                                             registered before /:id.
// GET   /api/operations                    - list, filterable + paginated
//                                             (?siteId=&clientId=
//                                             &shiftTypeId=&reviewStatus=
//                                             &dateFrom=&dateTo=&page=
//                                             &pageSize=)
// POST  /api/operations                    - create (siteId + shiftTypeId +
//                                             date required; both ids must
//                                             reference existing records,
//                                             shiftType must be active;
//                                             clientId is always
//                                             snapshotted server-side from
//                                             the site's current client)
// GET   /api/operations/:id                - view one; includes
//                                             attendanceRecords + a
//                                             calculated (never stored)
//                                             coverage object
// PUT   /api/operations/:id                - edit narrative fields only
//                                             (siteIssues/incidents/
//                                             operationalReport/notes/
//                                             submittedBy) — NOT siteId/
//                                             shiftTypeId/date/reviewStatus
// POST  /api/operations/:id/review         - PENDING -> APPROVED/REJECTED,
//                                             one-time only per record
// POST  /api/operations/:id/attendance     - create an AttendanceRecord
//                                             for this OperationsRecord
//                                             (employeeId + status
//                                             required; rosterEntryId
//                                             optional; replacementFor-
//                                             EmployeeId REQUIRED when
//                                             status=REPLACEMENT and
//                                             BLOCKED otherwise — decided
//                                             2026-09-10). Duplicate
//                                             (operationsRecordId,
//                                             employeeId) -> clean 409.
// GET   /api/operations/:id/attendance     - list AttendanceRecords for
//                                             this OperationsRecord

router.get("/coverage-summary", controller.getCoverageSummary);
router.get("/attendance-calendar", controller.getAttendanceCalendar);
router.get("/", controller.listOperationsRecords);
router.post("/", controller.createOperationsRecord);
router.get("/:id", controller.getOperationsRecord);
router.put("/:id", controller.updateOperationsRecord);
router.post("/:id/review", controller.reviewOperationsRecord);
router.post("/:id/attendance", controller.createAttendanceRecord);
router.get("/:id/attendance", controller.listAttendanceRecords);

export default router;
