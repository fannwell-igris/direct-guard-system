import { Router } from "express";
import * as controller from "./general-expenses.controller";

const router = Router();

// GET    /api/general-expenses        - list, ?departmentId=&departmentRequestId=&category=&page=&pageSize=
// POST   /api/general-expenses        - create; linking departmentRequestId auto-sets it to FULFILLED
// GET    /api/general-expenses/:id    - view one
// PUT    /api/general-expenses/:id    - edit; changing/removing departmentRequestId manages FULFILLED status
// DELETE /api/general-expenses/:id    - hard delete (genuine correction); un-fulfils linked request if last expense

router.get("/", controller.listGeneralExpenses);
router.post("/", controller.createGeneralExpense);
router.get("/:id", controller.getGeneralExpense);
router.put("/:id", controller.updateGeneralExpense);
router.delete("/:id", controller.deleteGeneralExpense);

export default router;
