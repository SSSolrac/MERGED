# Happy Tails Pet Cafe System Manual

This document is the operating manual for the Happy Tails Pet Cafe web system. It explains how the customer website, staff dashboard, and owner dashboard work.

The active application is inside:

```text
Happy-tails-fontend/frontend
```

Use this manual when training customers, staff, owners, or administrators who need to understand how each page works.

## 1. System Overview

Happy Tails Pet Cafe System is a web-based ordering and cafe management system.

The system has three main user areas:

- Customer website: for browsing the cafe, ordering, checkout, order tracking, notifications, profile, loyalty, and reviews.
- Staff dashboard: for viewing orders, confirming payments, updating order status, editing the daily menu, managing menu items, checking inventory, and viewing customer loyalty.
- Owner dashboard: for all staff features plus business settings, delivery coverage, staff access, announcements, imports, and activity logs.

## 2. Account Roles

The system changes what a user can see based on their account role.

### Customer

Customers use the public website. They can browse, order, track orders, view order history, manage profile details, use loyalty features, and submit reviews after eligible orders.

Customer pages:

- `/`
- `/menu`
- `/about`
- `/order`
- `/order/:category`
- `/checkout`
- `/order-success`
- `/track-order`
- `/notifications`
- `/profile/info`
- `/profile/loyalty`
- `/order-history`

### Staff

Staff members use the staff workspace:

```text
/staff
```

After login, staff are sent to:

```text
/staff/dashboard
```

Staff can manage daily operations but cannot open owner-only administration pages.

### Owner

Owners use the owner workspace:

```text
/owner
```

After login, owners are sent to:

```text
/owner/dashboard
```

Owners can access all staff pages plus owner-only pages such as settings, delivery coverage, imports, staff access, and activity logs.

## 3. Customer Website Manual

### 3.1 Home Page

Page:

```text
/
```

The home page is the main storefront. Customers use it to see the cafe brand, announcements, featured content, menu highlights, menu of the day, and community reviews.

How it works:

- The navigation bar lets customers move to Menu, Order, About, notifications, profile, and login.
- Announcement banners can be controlled by the owner from Settings.
- Menu of the Day shows the current published daily menu.
- Community Reviews shows public customer reviews from completed orders.
- Order buttons guide customers into the ordering flow.

Staff note: If an announcement, daily menu, or review does not appear, check the owner/staff dashboard settings and the related database data.

### 3.2 Menu Page

Page:

```text
/menu
```

The menu page shows available cafe items. Customers can browse food, drinks, and other menu categories before ordering.

Customers can:

- View item names.
- View prices.
- Read item descriptions.
- See menu images.
- Decide what they want before placing an order.

If an item is missing, check Menu Management in the dashboard. The item may be inactive, unavailable, uncategorized, or missing from the menu database.

### 3.3 About Page

Page:

```text
/about
```

The About page gives customers information about Happy Tails Pet Cafe, including cafe details and visual content about the shop.

Use this page when customers want to know more about the business before ordering.

### 3.4 Order Page

Page:

```text
/order
```

The order page is where customers choose items for their order.

Basic ordering flow:

1. Open `/order`.
2. Choose a category or browse available items.
3. Add items to the cart.
4. Adjust quantities if needed.
5. Continue adding items until the order is complete.
6. Proceed to checkout.

Important notes:

- Loyalty reward items may require the customer to be logged in.
- Free loyalty rewards cannot be checked out by themselves; the customer must add at least one regular item.
- The cart must contain at least one valid item before checkout.

### 3.5 Category Order Pages

Page pattern:

```text
/order/:category
```

Category pages show items from a selected category. These pages help customers find a specific group of products faster.

Example use:

- A customer chooses a drink category.
- The system shows only items in that category.
- The customer adds items and continues to checkout.

### 3.6 Checkout Page

Page:

```text
/checkout
```

Checkout is where the customer confirms their order details, order type, payment method, receipt upload, and final total.

Customer details:

- Name is required.
- Philippine phone number is required.
- The phone input accepts formats like `9XXXXXXXXX` or `09XXXXXXXXX`.
- Logged-in customers may have profile details filled automatically.

Order types:

- Dine-in
- Pickup
- Takeout
- Delivery

The owner controls which order types are available from Owner Settings. If an order type is disabled, customers cannot choose it.

Delivery orders:

- Delivery requires a valid delivery address.
- The customer must select a supported delivery area or purok.
- The delivery pin/location must be inside the allowed delivery distance.
- The delivery fee is calculated before submission.
- If delivery coverage is incomplete, the customer will see an error and cannot submit a delivery order.

Payment methods:

- QRPH
- GCash
- MariBank
- BDO
- Cash

The owner controls which payment methods are available from Owner Settings.

Receipt upload:

- Online payment methods require a receipt image.
- Accepted receipt formats are PNG, JPG, JPEG, and WebP.
- The receipt image must be 5 MB or smaller.
- Cash payments do not require receipt upload.
- Free loyalty reward orders do not require receipt upload.

Before pressing Place Order, the customer should check:

- Name
- Phone number
- Order type
- Delivery details, if delivery is selected
- Payment method
- Receipt image, if required
- Items and quantities
- Delivery fee
- Final total

### 3.7 Order Success Page

Page:

```text
/order-success
```

This page appears after a successful order submission. It confirms that the order was placed and guides the customer to continue tracking the order.

If the customer is not redirected here, the order may not have been submitted successfully.

### 3.8 Track Order Page

Page:

```text
/track-order
```

Customers use this page to check the latest status of their order.

Common order statuses:

- `pending`: order was submitted and is waiting for staff action.
- `preparing`: staff started preparing the order.
- `ready`: order is ready for pickup, dine-in serving, or next handling step.
- `out_for_delivery`: delivery order is on the way.
- `completed`: order is finished.
- `delivered`: delivery order reached the customer.
- `cancelled`: order was cancelled.
- `refunded`: order was refunded.

If an order does not appear, possible reasons include:

- The customer is not logged in.
- The order was made as a guest.
- The order was made using a different account.
- The staff has not updated the order yet.
- The database connection is unavailable.

### 3.9 Notifications Page

Page:

```text
/notifications
```

This page shows customer notifications, such as order updates or account-related messages.

Customers should check this page when they want to see recent updates from the system.

### 3.10 Profile Page

Page:

```text
/profile/info
```

The profile page lets customers view or update account information.

Customers can use it to check:

- Name
- Email
- Phone number
- Saved customer details

Customer profile data helps checkout fill in details faster.

### 3.11 Loyalty Page

Page:

```text
/profile/loyalty
```

The loyalty page shows customer loyalty information and rewards.

Customers can use it to:

- View loyalty status.
- Check available rewards.
- Understand reward progress.
- Use eligible rewards during ordering.

Important: Some loyalty rewards require the customer to be logged in and must be used with at least one regular menu item.

### 3.12 Order History Page

Page:

```text
/order-history
```

Order History shows previous orders for the logged-in customer.

Customers can use it to:

- Review past orders.
- Check previous totals.
- Find order records.
- Access eligible review prompts when available.

If no orders appear, check whether the customer is logged in with the same account used to place the order.

### 3.13 Reviews

Reviews appear after eligible completed or delivered orders.

Customer review flow:

1. Complete or receive an order.
2. Open the review prompt when it appears.
3. Select a rating.
4. Enter a comment.
5. Submit the review.

Review rules:

- A review must have a valid rating.
- A review must have a comment.
- The system may allow only one review per order.
- Public reviews can appear on the home page.

## 4. Staff Dashboard Manual

Staff workspace:

```text
/staff
```

Staff dashboard pages:

- `/staff/dashboard`
- `/staff/orders`
- `/staff/daily-menu`
- `/staff/menu`
- `/staff/inventory`
- `/staff/customers`
- `/staff/profile`

### 4.1 Staff Dashboard Layout

The dashboard has three main areas:

- Sidebar navigation: links to dashboard pages.
- Top bar: page title, quick search, and notifications.
- Main content area: the selected page.

On mobile, the dashboard uses:

- A menu button in the top bar.
- A bottom navigation bar for common pages.

### 4.2 Dashboard Overview

Page:

```text
/staff/dashboard
```

The dashboard overview summarizes cafe activity.

Staff can see:

- Top-selling items.
- Alerts.
- Recent orders.
- Operational activity.

Owner accounts see more business performance cards and charts, including:

- Gross sales.
- Refunds and cancellations.
- Discounts.
- Net sales.
- Estimated profit.
- Sales breakdown.
- Gross sales chart.
- Profit insight messages.

Important dashboard rule:

Dashboard totals depend on confirmed payments. New customer orders should not be treated as sales until staff confirms payment.

Correct workflow:

1. Open the new order.
2. Check payment method.
3. Check payment proof or cash payment.
4. Press Confirm Payment only when payment is verified.
5. After payment is confirmed, the order can affect dashboard totals and charts.

### 4.3 Orders Page

Page:

```text
/staff/orders
```

The Orders page is the main work area for staff during daily operations.

Staff can:

- Search orders by order code.
- Filter orders by date range.
- Filter orders by status.
- View status counts for the current page.
- Open full order details.
- Check customer details.
- Check order type.
- Check payment method.
- Preview payment QR information.
- View uploaded receipt/payment proof.
- Confirm payment.
- Update order status.
- Add a cancellation note when cancelling.
- Review the order status timeline.
- Read internal order notes.

Basic order handling:

1. Open `/staff/orders`.
2. Find the newest order or search by order code.
3. Click View Details.
4. Check customer name, email, phone, order type, and delivery address if applicable.
5. Check ordered items, subtotal, discount, delivery fee, and grand total.
6. Check payment method and uploaded receipt.
7. Click Confirm Payment only after the payment is verified.
8. Select the correct new status.
9. Click Update Status.

Status guide:

- `pending`: use when the order is newly received.
- `preparing`: use when kitchen preparation has started.
- `ready`: use when the order is ready for pickup or serving.
- `out_for_delivery`: use when a delivery order has left the cafe.
- `completed`: use when dine-in, pickup, or takeout is finished.
- `delivered`: use when a delivery order has reached the customer.
- `cancelled`: use when the order will not continue.
- `refunded`: use when payment was returned.

Staff reminders:

- Do not confirm payment without checking the receipt or cash payment.
- Do not mark unfinished orders as completed.
- Use cancellation notes when the reason needs to be recorded.
- Always open order details before changing an unfamiliar order.

### 4.4 Daily Menu Page

Page:

```text
/staff/daily-menu
```

The Daily Menu page controls the menu of the day shown to customers.

Staff can use it to:

- Select daily featured items.
- Review the daily menu preview.
- Publish or update the daily menu.
- Keep the home page daily menu current.

Basic daily menu workflow:

1. Open `/staff/daily-menu`.
2. Review the date or active daily menu.
3. Select the items to feature.
4. Check the preview.
5. Save or publish the daily menu.
6. Open the customer home page and confirm it appears correctly.

### 4.5 Menu Management Page

Page:

```text
/staff/menu
```

Menu Management controls the products customers see and order.

Staff can use it to manage:

- Item names.
- Descriptions.
- Prices.
- Categories.
- Images.
- Availability.
- Discounts, if supported by the item data.

Recommended workflow when editing menu items:

1. Search or find the item.
2. Check the current details.
3. Edit only the needed fields.
4. Save the item.
5. Open the customer menu or order page to verify the change.

Important: Price mistakes directly affect customer checkout totals.

### 4.6 Inventory Page

Page:

```text
/staff/inventory
```

Inventory helps staff monitor stock, ingredients, and inventory movement.

Staff can use it to:

- View ingredients or stock items.
- Check available quantity.
- Record stock changes.
- Record waste or usage.
- Review stock history.
- Keep inventory data aligned with actual cafe supplies.

Recommended inventory workflow:

1. Count actual stock.
2. Open `/staff/inventory`.
3. Find the ingredient or stock item.
4. Enter the correct stock movement.
5. Save.
6. Confirm the new quantity.

Do not guess stock values. Inventory should match actual counted stock whenever possible.

### 4.7 Customer Loyalty Page

Page:

```text
/staff/customers
```

The Customer Loyalty page helps staff view customer records and loyalty information.

Staff can use it to:

- Search customers.
- View loyalty status.
- Check loyalty activity.
- Review reward-related customer information.

Privacy reminder: Customer information should only be used for cafe operations.

### 4.8 Staff Profile Page

Page:

```text
/staff/profile
```

The staff profile page shows the logged-in staff account details.

Staff can use it to:

- Confirm the current account.
- Review name and role information.
- Update allowed profile details if supported.

### 4.9 Dashboard Notifications

The bell icon in the dashboard top bar shows unread notifications.

Staff can:

- Open the notification panel.
- Read recent unread notifications.
- Mark one notification as read.
- Mark all notifications as read.
- View recently read notifications.

### 4.10 Dashboard Quick Search

The quick search box in the dashboard top bar helps staff jump to dashboard pages faster.

Searchable links include:

- Dashboard Overview
- View Orders
- Edit Daily Menu
- Manage Menu Items
- Inventory
- Customer Loyalty
- Import Sales Data, owner only
- Settings, owner only
- Delivery Coverage, owner only
- Activity Log, owner only

## 5. Owner Dashboard Manual

Owner workspace:

```text
/owner
```

Owner pages:

- `/owner/dashboard`
- `/owner/orders`
- `/owner/daily-menu`
- `/owner/menu`
- `/owner/inventory`
- `/owner/customers`
- `/owner/profile`
- `/owner/imports`
- `/owner/settings`
- `/owner/admin/delivery-coverage`
- `/owner/admin/activity-log`

Owners can use staff pages the same way staff do. The following sections explain owner-only pages.

### 5.1 Owner Dashboard

Page:

```text
/owner/dashboard
```

The owner dashboard includes operational information plus business performance information.

Owners can use it to review:

- Gross sales.
- Refunds and cancellations.
- Discounts.
- Net sales.
- Estimated profit.
- Delivery fees.
- Cost estimate.
- Margin.
- Sales chart by day, week, or month.
- Top-selling items.
- Recent orders.
- Alerts.
- Profit insight messages.

Date filtering:

- Use the date range filter to change the dashboard period.
- Available views may include today, last 7 days, last 30 days, last 90 days, last 3 months, last 6 months, last 1 year, and all time.

Chart controls:

- Chart type can be changed between area, line, and bar.
- Sales can be grouped by days, weeks, or months.

Important: Payment must be confirmed before an order should be counted as reliable sales data.

### 5.2 Settings Page

Page:

```text
/owner/settings
```

Settings is the main owner control page. It is divided into tabs.

#### Business Settings Tab

Use this tab to manage:

- Cafe name.
- Business hours text.
- Contact number.
- Business email.
- Cafe address.
- Facebook page.
- Instagram handle.
- Logo or branding image.

After saving, check the public website to make sure the changes look correct.

#### Announcements Tab

Use this tab to manage homepage banner announcements.

Owners can:

- Add announcement text.
- Set optional start date.
- Set optional end date.
- Turn each announcement active or inactive.
- Remove announcements.
- Save announcement changes.

The announcement text appears in the moving banner on the customer home page.

#### Checkout Settings Tab

Use this tab to control checkout behavior.

Available order types:

- Dine-in
- Pickup
- Takeout
- Delivery

Payment methods:

- QRPH
- GCash
- MariBank
- BDO
- Cash

Checkout cut-off hours:

- Weekday opening time.
- Weekday closing time.
- Weekend opening time.
- Weekend closing time.

Important:

- If all order types are disabled, customers cannot check out.
- If all payment methods are disabled, paid orders cannot be submitted.
- Customer checkout is blocked outside the configured ordering hours.
- Delivery area details are managed from Delivery Coverage, not from this tab.

#### Staff Tab

Use this tab to manage staff access.

Owners can:

- Add staff access by email.
- Add or update staff name.
- Add or update job title.
- View current staff members.
- Revoke staff access.

Important:

- The staff member must already have a Supabase/account email in the system.
- If no account is found, ask the person to sign up first.
- Only trusted employees should be given staff access.

### 5.3 Delivery Coverage Page

Page:

```text
/owner/admin/delivery-coverage
```

Delivery Coverage controls where delivery orders are allowed.

Owners can use it to manage:

- Active delivery area.
- Fixed barangay or service area information.
- City, province, and country.
- Supported puroks or sub-areas.
- Map pin or location coordinates.
- Maximum delivery distance.
- Delivery fee rules.
- Whether delivery coverage is active.

Delivery checkout depends on this page. Customers cannot submit delivery orders if coverage is missing, inactive, or incomplete.

When delivery is not working, check:

- Delivery is enabled in Checkout Settings.
- Delivery Coverage has an active area.
- Supported puroks exist.
- Pickup point coordinates are set.
- Maximum delivery distance is greater than zero.
- The customer selected a valid purok.
- The customer pin is inside the supported distance.

### 5.4 Import Sales Data Page

Page:

```text
/owner/imports
```

Imports is used for owner-level sales data import and reporting workflows.

Recommended import workflow:

1. Prepare the CSV file.
2. Open `/owner/imports`.
3. Upload the file.
4. Preview the rows.
5. Review errors or invalid rows.
6. Fix the CSV if needed.
7. Import only when the preview is correct.

Do not import a file if the preview shows many unexpected errors.

### 5.5 Activity Log Page

Page:

```text
/owner/admin/activity-log
```

The Activity Log records important system actions.

Owners can use it to investigate:

- Staff activity.
- Owner activity.
- Login-related events.
- Order or settings changes.
- Recent administrative actions.

Use this page when something changed and the owner needs to know what happened.

## 6. Login And Logout Manual

### 6.1 Customer Login

1. Open the website.
2. Click the login/account button.
3. Enter email and password.
4. Submit the form.
5. Continue using the customer website.

### 6.2 Staff Login

1. Open the website.
2. Log in using the staff account.
3. The system redirects to `/staff/dashboard`.
4. If it does not redirect, manually open `/staff`.

If access fails, the account role may not be set to `staff`.

### 6.3 Owner Login

1. Open the website.
2. Log in using the owner account.
3. The system redirects to `/owner/dashboard`.
4. If it does not redirect, manually open `/owner`.

If access fails, the account role may not be set to `owner`.

### 6.4 Logout

Use Sign Out from the customer navigation or dashboard sidebar.

Always log out after using the system on a shared computer.

## 7. Daily Operating Procedures

### 7.1 Opening Procedure

1. Log in as staff or owner.
2. Open Dashboard Overview.
3. Check alerts.
4. Open Orders and check pending orders.
5. Open Daily Menu and confirm today's menu is correct.
6. Open Inventory if stock needs to be checked.
7. Open the customer website and confirm ordering is available.

### 7.2 Handling A New Order

1. Open `/staff/orders` or `/owner/orders`.
2. Open the order details.
3. Confirm the customer information.
4. Confirm the item list and total.
5. Check delivery details if the order is for delivery.
6. Check the payment method.
7. Check the receipt image if payment is online.
8. Click Confirm Payment only after payment is verified.
9. Change status to `preparing` when work starts.
10. Change status as the order moves forward.
11. Mark the order `completed` or `delivered` only when finished.

### 7.3 Closing Procedure

1. Make sure all active orders have correct statuses.
2. Confirm all valid payments.
3. Cancel orders that were not completed and add notes when needed.
4. Review dashboard totals.
5. Update inventory if stock changed.
6. Prepare or update the next daily menu if needed.
7. Log out.

## 8. Troubleshooting Manual

### Customer Cannot Place Order

Check:

- Cart has items.
- Customer name is filled in.
- Phone number is valid.
- The selected order type is enabled.
- The selected payment method is enabled.
- Receipt is uploaded for online payments.
- Ordering hours are currently open.
- Delivery coverage is configured if delivery is selected.

### Delivery Does Not Work

Check:

- Delivery is enabled in Owner Settings.
- Delivery Coverage is active.
- Puroks are configured.
- Pickup coordinates are configured.
- Maximum distance is configured.
- Customer selected a supported purok.
- Customer location is inside the delivery range.

### Receipt Upload Does Not Work

Check:

- File is PNG, JPG, JPEG, or WebP.
- File is 5 MB or smaller.
- Customer selected an online payment method.
- Browser has permission to choose files.

### Staff Cannot Open Dashboard

Check:

- User is logged in.
- Account role is `staff` or `owner`.
- User is opening `/staff`.
- Supabase profile role is correct.

### Owner Cannot Open Owner Pages

Check:

- User is logged in.
- Account role is exactly `owner`.
- User is opening `/owner`.
- Owner-only pages are not being accessed from a staff account.

### Dashboard Numbers Look Wrong

Check:

- Date range filter.
- Payment confirmation status.
- Cancelled and refunded orders.
- Whether menu item costs exist for profit estimates.
- Whether recent orders were actually confirmed as paid.

### Menu Item Does Not Show To Customers

Check:

- Item exists in Menu Management.
- Item is active or available.
- Item category is correct.
- Item has valid price data.
- Customer page was refreshed.

### Reviews Do Not Show

Check:

- The order is completed or delivered.
- The customer submitted a review.
- The review has a rating and comment.
- The review is public.
- The customer home page was refreshed.

## 9. Administrator Notes

These notes are for the person maintaining or deploying the system.

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

The root `package.json` forwards these commands to the active frontend folder: `Happy-tails-fontend/frontend`.

## 10. Final Readiness Checklist

Before giving the system to users, confirm:

- Customer home page opens.
- Menu page loads.
- Order page works.
- Checkout works for enabled order types.
- Receipt upload works for online payments.
- Delivery validation works if delivery is enabled.
- Order success page appears after order submission.
- Order tracking shows the latest status.
- Customer order history works.
- Customer reviews appear on the home page.
- Staff login works.
- Staff can view and update orders.
- Staff can confirm payment.
- Staff can update daily menu.
- Staff can manage menu items.
- Staff can check inventory.
- Owner login works.
- Owner settings save correctly.
- Owner delivery coverage is correct.
- Owner can manage staff access.
- Dashboard numbers update after payment confirmation.
- Supabase authentication redirect URLs are correct.
- Production environment variables are correct.
- Production build succeeds.

If all checklist items pass, the system is ready for normal use.
