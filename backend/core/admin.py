from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django import forms
from django.contrib import messages
from django.utils.html import format_html
import secrets
from import_export import resources
from import_export.admin import ImportExportModelAdmin
from rangefilter.filters import DateRangeFilterBuilder
from .admin_site import varasto_admin_site
from .models import ApiKey, AuditLog, Company, User


class CompanyResource(resources.ModelResource):
    """CSV/XLSX round-trip for Company.

    Export carries the identifying + lifecycle fields. Import is guarded:
    ``license_code`` is server-generated (see ``Company.save``) so it is
    stripped from the import field set — a client-supplied value can never
    overwrite it. Import itself is gated to superusers by
    ``CompanyAdmin.has_import_permission``.
    """

    class Meta:
        model = Company
        fields = ('id', 'name', 'account_type', 'license_code', 'vat', 'is_active', 'created_at')
        export_order = fields
        import_id_fields = ('id',)

    def get_import_fields(self):
        return [f for f in super().get_import_fields() if f.column_name != 'license_code']


class CompanyAdminForm(forms.ModelForm):
    admin_username = forms.CharField(
        label="Initial Operator ID (Username)",
        required=False,
        help_text="Leave blank to create a Company WITHOUT an initial admin user."
    )
    admin_email = forms.EmailField(label="Operator Email", required=False)
    admin_first_name = forms.CharField(label="First Name", required=False)
    admin_last_name = forms.CharField(label="Last Name", required=False)

    class Meta:
        model = Company
        fields = '__all__'


@admin.register(Company, site=varasto_admin_site)
class CompanyAdmin(ImportExportModelAdmin):
    form = CompanyAdminForm
    resource_classes = [CompanyResource]
    list_display = ('name', 'account_type', 'parent', 'license_code', 'is_active', 'created_at', 'id')
    list_filter = (
        'account_type',
        'is_active',
        ('created_at', DateRangeFilterBuilder()),
    )
    search_fields = ('name', 'license_code', 'vat', 'id')
    date_hierarchy = 'created_at'
    list_select_related = ('parent',)
    autocomplete_fields = ('parent',)
    ordering = ('-created_at',)
    list_per_page = 50
    actions = ('suspend_companies', 'reactivate_companies', 'rotate_license')
    readonly_fields = ('license_code', 'id', 'created_at', 'license_rotated_at')
    fieldsets = (
        (None, {
            'fields': ('name', 'account_type', 'parent', 'license_code', 'id', 'is_active', 'created_at', 'settings')
        }),
        ('License (GOVERNANCE-11)', {
            'fields': (
                'license_expires_at',
                'max_users', 'max_products', 'max_managed_companies',
                'license_rotated_at',
            ),
            'description': "Expiry (blank = perpetual) gates writes; quotas "
                           "(blank = unlimited) are checked at create time.",
        }),
        ('Initial Admin User (Optional)', {
            'fields': ('admin_username', 'admin_email', 'admin_first_name', 'admin_last_name'),
            'description': "If you want to create an initial admin user, fill these in. If left blank, NO user will be created."
        }),
    )

    def has_import_permission(self, request):
        # Importing companies can mint privileged tenants — superusers only.
        return bool(request.user and request.user.is_superuser)

    @admin.action(description="Suspend selected companies (block login/API)")
    def suspend_companies(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(
            request, f"{updated} company(ies) suspended.", messages.SUCCESS
        )

    @admin.action(description="Reactivate selected companies")
    def reactivate_companies(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(
            request, f"{updated} company(ies) reactivated.", messages.SUCCESS
        )

    @admin.action(description="Rotate license code (invalidate old)")
    def rotate_license(self, request, queryset):
        count = 0
        for company in queryset:
            company.rotate_license()
            count += 1
        self.message_user(
            request,
            f"Rotated license code for {count} company(ies). Old codes are now invalid.",
            messages.SUCCESS,
        )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)

        if not change:
            admin_username = form.cleaned_data.get('admin_username')

            if admin_username:
                admin_email = form.cleaned_data.get('admin_email')
                admin_first_name = form.cleaned_data.get('admin_first_name')
                admin_last_name = form.cleaned_data.get('admin_last_name')

                existing_user = User.objects.filter(username=admin_username).first()

                if existing_user:
                    user = existing_user
                    if admin_email:
                        user.email = admin_email
                    if admin_first_name:
                        user.first_name = admin_first_name
                    if admin_last_name:
                        user.last_name = admin_last_name
                    user.company = obj
                    user.save()
                    generated_password = None
                else:
                    generated_password = secrets.token_urlsafe(12)
                    user = User.objects.create_user(
                        username=admin_username,
                        password=generated_password,
                        email=admin_email or "",
                        first_name=admin_first_name or "",
                        last_name=admin_last_name or "",
                    )
                    # Initial admin user provisioned for a fresh company is its
                    # OWNER (GOVERNANCE-11) — full intra-company governance.
                    user.role = User.Role.OWNER
                    user.company = obj
                    user.save()

                # Seed default locations
                from inventory.services import StrategyService
                from inventory.models import Location
                if Location.objects.filter(company=obj).count() == 0:
                    StrategyService.seed_default_locations(obj)

                if generated_password:
                    password_html = format_html("<li><strong>Access Key:</strong> {}</li>", generated_password)
                    title_html = format_html("<strong>Company & Admin User Created!</strong>")
                else:
                    password_html = format_html("<li><strong>Access Key:</strong> (Existing Password)</li>")
                    title_html = format_html("<strong>Company Created! (Existing User Linked)</strong>")

                msg = format_html(
                    """
                    <div style="font-size: 1.1em; line-height: 1.5;">
                        {}<br>
                        Please save these credentials:<br>
                        <ul style="margin-top: 5px;">
                            <li><strong>License Code:</strong> {}</li>
                            <li><strong>Company:</strong> {}</li>
                            <li><strong>Operator ID:</strong> {}</li>
                            {}
                        </ul>
                    </div>
                    """,
                    title_html,
                    obj.license_code,
                    obj.name,
                    user.username,
                    password_html
                )
                messages.success(request, msg)
            else:
                # Seed default locations even without user
                from inventory.services import StrategyService
                from inventory.models import Location
                if Location.objects.filter(company=obj).count() == 0:
                    StrategyService.seed_default_locations(obj)

                msg = format_html(
                    """
                    <div style="font-size: 1.1em; line-height: 1.5;">
                        <strong>Company Created Successfully!</strong><br>
                        <ul style="margin-top: 5px;">
                            <li><strong>License Code:</strong> {}</li>
                            <li><strong>Company:</strong> {}</li>
                        </ul>
                        <em>No admin user was created (as requested).</em>
                    </div>
                    """,
                    obj.license_code,
                    obj.name
                )
                messages.success(request, msg)


class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'is_staff', 'is_active', 'company', 'license_code')
    list_filter = ('is_staff', 'is_superuser', 'is_active', 'company', 'role')
    search_fields = ('username', 'email', 'first_name', 'last_name', 'company__name')
    autocomplete_fields = ('company',)
    list_select_related = ('company',)
    ordering = ('username',)
    actions = ('activate_users', 'deactivate_users')

    def license_code(self, obj):
        if obj.company:
            return obj.company.license_code
        return "-"
    license_code.short_description = "License Code"

    @admin.action(description="Activate selected users")
    def activate_users(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(
            request, f"{updated} user(s) activated.", messages.SUCCESS
        )

    @admin.action(description="Deactivate selected users (block login)")
    def deactivate_users(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(
            request, f"{updated} user(s) deactivated.", messages.SUCCESS
        )

varasto_admin_site.register(User, CustomUserAdmin)


@admin.register(ApiKey, site=varasto_admin_site)
class ApiKeyAdmin(admin.ModelAdmin):
    list_display = (
        'label', 'company', 'is_active', 'rate_limit_tier', 'expiry_state',
        'usage_count', 'last_used_at', 'created_at',
    )
    list_filter = ('is_active', 'rate_limit_tier', 'company')
    search_fields = ('label', 'company__name', 'key')
    autocomplete_fields = ('company',)
    list_select_related = ('company',)
    readonly_fields = ('key', 'usage_count', 'last_used_at', 'created_at')
    date_hierarchy = 'created_at'
    ordering = ('-created_at',)
    actions = ('revoke_keys', 'activate_keys')

    @admin.display(description="Expiry")
    def expiry_state(self, obj):
        from django.utils import timezone
        from datetime import timedelta
        if not obj.expires_at:
            return format_html(
                '<span style="color:#2e7d32;font-weight:600;">ok</span>'
            )
        now = timezone.now()
        if obj.expires_at <= now:
            return format_html(
                '<span style="color:#fff;background:#c62828;padding:2px 6px;'
                'border-radius:3px;font-weight:600;">expired</span>'
            )
        if obj.expires_at <= now + timedelta(days=7):
            return format_html(
                '<span style="color:#fff;background:#f9a825;padding:2px 6px;'
                'border-radius:3px;font-weight:600;">expiring (≤7d)</span>'
            )
        return format_html(
            '<span style="color:#2e7d32;font-weight:600;">ok</span>'
        )

    @admin.action(description="Revoke selected keys (deactivate)")
    def revoke_keys(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(
            request, f"{updated} API key(s) revoked.", messages.SUCCESS
        )

    @admin.action(description="Activate selected keys")
    def activate_keys(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(
            request, f"{updated} API key(s) activated.", messages.SUCCESS
        )


@admin.register(AuditLog, site=varasto_admin_site)
class AuditLogAdmin(admin.ModelAdmin):
    """Append-only forensic view. AuditLog rows are written by the system,
    never edited or deleted from the admin — add/change/delete are all denied.
    """
    list_display = ('created_at', 'actor', 'action', 'target_company')
    list_filter = (
        'action',
        'target_company',
        ('created_at', DateRangeFilterBuilder()),
    )
    search_fields = ('actor__username', 'action', 'target_company__name')
    date_hierarchy = 'created_at'
    list_select_related = ('actor', 'target_company')
    ordering = ('-created_at',)
    readonly_fields = ('id', 'actor', 'action', 'target_company', 'created_at', 'metadata_pretty')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="Metadata")
    def metadata_pretty(self, obj):
        import json
        return format_html(
            '<pre style="margin:0;white-space:pre-wrap;">{}</pre>',
            json.dumps(obj.metadata or {}, indent=2, ensure_ascii=False, default=str),
        )
