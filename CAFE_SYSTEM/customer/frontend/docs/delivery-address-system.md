# Delivery Address System (Leaflet + OpenStreetMap + Configurable Coverage)

## Summary
This implementation adds a delivery-address workflow where:
- the **selected purok** comes from DB-backed dropdown options,
- the customer pin must be **inside the active polygon**,
- the final address is normalized as:
  `houseDetails, selectedPurok, fixedBarangayName, Lucena City, Quezon, Philippines`.

Leaflet + OpenStreetMap are used for map rendering and pin interaction only, not as the source of purok truth.

## Database / Migration
Apply:
- `customer/frontend/supabase/unified_schema.sql`
- `customer/frontend/supabase/delivery_area_schema.sql`

`delivery_area_schema.sql` adds:
- `delivery_areas`
- `delivery_puroks`
- `delivery_area_polygons`
- optional `delivery_area_versions` history snapshots
- helper functions:
  - `public.is_point_inside_polygon(...)`
  - `public.build_delivery_address(...)`
  - `public.validate_delivery_address(...)`
- updated `public.create_customer_order(...)` that validates delivery payloads server-side for delivery orders.

## Customer Flow
Main files:
- `src/pages/Checkout.jsx`
- `src/components/DeliveryAddressForm.jsx`
- `src/services/deliveryAreaService.js`
- `src/utils/deliveryAddress.js`
- `src/services/orderService.js`

Flow:
1. Checkout loads active area, active puroks, polygon from DB.
2. Customer picks purok from dropdown and places pin via map.
3. Client validates:
   - required house details
   - active purok selected
   - pin inside polygon
4. Before order RPC, checkout calls `validate_delivery_address` RPC for authoritative server validation.
5. `create_customer_order` stores normalized delivery address and related delivery metadata.

## Staff/Owner Flow
Main files:
- `Staffowner/src/pages/admin/DeliveryCoveragePage.tsx`
- `Staffowner/src/services/deliveryCoverageService.ts`

Admin page supports:
- area label/city/province/country updates
- active/inactive area status
- purok add/edit/remove, active toggle, sort order, status
- polygon editing via map click + draggable vertices

Saved values go to DB and are consumed by customer checkout.

## Env Setup
No map API key is required. The system uses OpenStreetMap tiles through Leaflet.
