# Platform Admin Guide

This guide is for administrators responsible for managing tenants, licenses, and system access.

## Accessing the Admin Panel
1. Navigate to `http://localhost/admin/`.
2. Login with your superuser credentials (e.g., `admin` / `password`).

## Managing Licenses
To onboard a new company (Tenant):
1. Go to the **Licenses** section.
2. Click **Add License**.
3. Select a **Plan Type** (e.g., "Enterprise") and a **Valid Until** date.
4. Click **Save**.

> **Automation**: When you save a License, the system automatically creates:
> - A **Company** linked to the license.
> - An **Admin User** for that company.
> - An **API Key** for integrations.

## Managing Companies
You can view the automatically created companies in the **Companies** section.
- You can edit the **Name** if needed.
- You can view related **Users** and **API Keys**.

## Managing Users
In the **Users** section, you can:
- Reset passwords for company admins.
- Create system-wide superusers.
