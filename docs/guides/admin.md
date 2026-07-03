# Platform Admin Guide

This guide is for administrators responsible for managing tenants and system access.

## Accessing the Admin Panel
1. Navigate to `http://localhost:8001/admin/` (or through the `:5173` dev proxy).
2. Login with superuser credentials. Create one with
   `docker compose run --rm backend python manage.py createsuperuser` (or
   `make backend-admin`). The dev seed creates a regular company admin
   (`e2e_admin`) which is **not** a superuser.

## Onboarding a Company (Tenant)
There is no separate "License" object — licensing lives as `license_*` fields on
the **Company** itself. To onboard a tenant:
1. Go to the **Companies** section and click **Add Company**.
2. Set the **Name**, **account type**, and the license fields (`license_code`,
   plan/limits, expiry).
3. Save, then create the company's first admin **User** and an **API Key** for
   integrations (each is its own admin section).

> Platform superusers can also manage tenants from the in-app **Platform
> Console** (metrics, provisioning, data export/deletion).

## Managing Companies
You can view the automatically created companies in the **Companies** section.
- You can edit the **Name** if needed.
- You can view related **Users** and **API Keys**.

## Managing Users
In the **Users** section, you can:
- Reset passwords for company admins.
- Create system-wide superusers.
