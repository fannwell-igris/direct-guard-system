import { Router } from "express";
import * as controller from "./inventory.controller";

const router = Router();

// GET  /api/inventory                        - list, ?itemType=&category=&status=&assignedToEmployeeId=&assignedToDepartmentId=&assignedToSiteId=&page=&pageSize=
// POST /api/inventory                        - create item
// GET  /api/inventory/:id                    - view one (includes assignment + counts)
// PUT  /api/inventory/:id                    - edit (name/category/condition/assignment/canTakeHome/status etc.)
//                                              quantity is NOT editable directly — use stock movements
//
// POST /api/inventory/:id/movements          - add a stock movement (PURCHASE/ISSUE/WRITE_OFF/ADJUSTMENT)
// GET  /api/inventory/:id/movements          - list all movements for an item
//
// POST /api/inventory/:id/take-home          - mark item as taken home (canTakeHome must be true, must be assigned to employee)
// POST /api/inventory/:id/return             - mark item as returned
// GET  /api/inventory/:id/take-home-log      - full take-home/return history

router.get("/", controller.listItems);
router.post("/", controller.createItem);
router.get("/:id", controller.getItem);
router.put("/:id", controller.updateItem);

router.post("/:id/movements", controller.addMovement);
router.get("/:id/movements", controller.listMovements);

router.post("/:id/take-home", controller.takeHome);
router.post("/:id/return", controller.returnItem);
router.get("/:id/take-home-log", controller.getTakeHomeLog);

export default router;
