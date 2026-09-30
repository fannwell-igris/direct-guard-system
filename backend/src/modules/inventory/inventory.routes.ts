import { Router } from "express";
import * as controller from "./inventory.controller";

const router = Router();

// ── Inventory Items ──────────────────────────────────────────────────────────
// GET    /api/inventory             - list items; ?itemType=ASSET|CONSUMABLE
//                                     &category=&status=&page=&pageSize=
// POST   /api/inventory             - create an item (ADMIN/MANAGER only, via permissions.ts)
// GET    /api/inventory/:id         - view one item (includes stockMovements)
// PUT    /api/inventory/:id         - edit item details (ADMIN/MANAGER only)
// PATCH  /api/inventory/:id/status  - archive / restore (ADMIN/MANAGER only)

router.get("/", controller.listItems);
router.post("/", controller.createItem);
router.get("/:id", controller.getItem);
router.put("/:id", controller.updateItem);
router.patch("/:id/status", controller.setItemStatus);

// ── Stock Movements ──────────────────────────────────────────────────────────
// GET  /api/inventory/:id/movements  - list movements for one item
// POST /api/inventory/:id/movements  - log a movement (ISSUE, PURCHASE, ADJUSTMENT, WRITE_OFF)
//   Operations role: ISSUE only (enforced in controller).
//   ADMIN/MANAGER: all movement types.

router.get("/:id/movements", controller.listMovements);
router.post("/:id/movements", controller.logMovement);

// ── Asset Collection Confirmation ────────────────────────────────────────────
// POST /api/inventory/:id/confirm-collection
//   ADMIN/MANAGER only (enforced in permissions.ts via POST rule).
//   Body: { confirmedBy: string }
//   Marks a PENDING_COLLECTION item as COLLECTED, clears the employee
//   assignment, and logs a RETURN_CONFIRMED stock movement.

router.post("/:id/confirm-collection", controller.confirmCollection);

export default router;
