## Merge Summary

This branch removes the legacy hardcoded customer delivery-address path and standardizes the customer and Staffowner apps on the current Supabase delivery-area model:

- customer checkout now uses Leaflet + OpenStreetMap only, with business-settings-driven order/payment availability and delivery-area-driven purok + polygon validation
- customer profile address saving now uses the same delivery-area config and normalization helpers as checkout
- owner settings now expose the missing service availability toggles that the customer app reads
- legacy `lucenaAddress` code was removed so there is no competing customer address implementation left in active source

Important architectural decisions:

- `delivery_areas`, `delivery_puroks`, and `delivery_area_polygons` are the source of truth for delivery coverage
- `business_settings` remains the source of truth for enabled order types and payment methods
- `delivery_radius_km` is retained in schema/service compatibility, but polygon validation is the only active delivery boundary check
- saved profile addresses persist normalized house/unit + purok text; the exact delivery pin is still confirmed at checkout time

## PR Checklist

- [ ] Old Google Maps implementation fully removed
- [ ] Leaflet + OpenStreetMap implementation is the only active map solution
- [ ] No remaining `google.maps` references in codebase
- [ ] No unused files, imports, or dead code left from previous implementation
- [ ] Customer delivery flow works end-to-end
- [ ] Purok dropdown only uses allowed values
- [ ] Submission is blocked outside allowed delivery polygon
- [ ] Admin can update puroks and delivery area settings
- [ ] Admin changes reflect correctly on customer side
- [ ] API/contracts between frontend and backend are aligned
- [ ] Environment variables cleaned up and documented
- [ ] Build passes
- [ ] Lint/type checks pass
- [ ] Core flows manually tested
- [ ] Reviewer notes and migration notes added

## Changelog

### Removed

- removed the legacy customer `lucenaAddress` utility and its stale tests
- removed hardcoded checkout availability assumptions so order/payment options are no longer fixed in the customer UI
- removed placeholder-looking customer `.env.example` secrets and cleaned the corrupted customer README tail

### Added

- added shared delivery-address tests covering normalized address composition, purok parsing, and polygon validation
- added customer checkout filtering based on public `business_settings` toggles
- added owner-facing service availability toggles to `SettingsPage`
- added merge-ready reviewer notes, checklist, migration notes, and testing summary in this file

### Changed

- changed customer profile address management to load active delivery coverage from Supabase and save normalized addresses with the shared helper
- changed checkout config loading to force-refresh delivery coverage on page load so recent admin changes are picked up
- changed hardening tests to verify business-settings integration, legacy-address removal, and the absence of Google Maps references
- changed README/setup guidance to document the required SQL migration order for local/dev environments

### Fixed

- fixed the customer/staffowner delivery contract split between hardcoded profile addresses and database-backed checkout coverage
- fixed the missing owner UI for service availability flags that were already stored in `business_settings`
- fixed stale tests that were asserting pre-delivery-polygon behavior
- fixed the customer map render sizing issue so Leaflet tiles/marker layout match the staff/owner implementation

## Testing Summary

### Verified

- customer app lint passes with `npm run lint`
- customer app tests pass with `npm test`
- customer app production build passes with `npm run build`
- Staffowner tests pass with `npm test`
- Staffowner production build passes with `npm run build`
- no runtime `google.maps` or Google Maps package references remain in active source
- customer checkout code now blocks delivery submission without an active purok, normalized address, and valid map pin
- owner business settings now control which order types and payment methods are shown in customer checkout

### Manual test scenarios

- browser-driven delivery checkout should still be exercised against a live Supabase project before merge
- place a marker inside the polygon and confirm delivery checkout succeeds
- place a marker outside the polygon and confirm submission is blocked
- switch active/inactive puroks in Staffowner and confirm the customer dropdown updates after reload
- disable/enable delivery or payment methods in owner settings and confirm the customer checkout options update
- edit an existing saved customer address and confirm checkout prefill still requires final map-pin confirmation

### Notes

- this environment did not run a live browser session against Supabase, so the manual scenarios above remain the final pre-merge browser pass
- the Staffowner test suite logs expected best-effort warnings for login history when Supabase env vars are intentionally absent
- both builds still emit large-chunk warnings from Vite; those are existing bundle-size warnings, not merge blockers for this change set

## Migration / Setup Notes

Apply these SQL files in order on the target Supabase project:

1. `customer/frontend/supabase/unified_schema.sql`
2. `customer/frontend/supabase/delivery_area_schema.sql`

Reviewer / deploy checklist before merge:

- ensure `business_settings.id = 1` exists after `unified_schema.sql`
- ensure at least one active `delivery_areas` row, active `delivery_puroks`, and a polygon with 3 or more points exist after `delivery_area_schema.sql`
- verify owner/business settings have at least one enabled order type and one enabled payment method
- use the updated `.env.example` placeholders and set project-specific Supabase values locally
