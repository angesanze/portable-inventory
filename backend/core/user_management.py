"""In-app intra-company user management (GOVERNANCE-11 / C2 / B3).

Lets an OWNER/ADMIN see the users in their (effective) company, an OWNER change
roles and deactivate members (offboarding), all scoped to the effective company
so a developer can manage a child tenant's users via ``X-Acting-Company``.

Guard rails:

* Listing requires the ``manage_users`` capability (OWNER only). ADMINs do NOT
  manage users in-app — this matches the role matrix (ADMIN = everything except
  user/license management).
* Role changes and deactivation require ``manage_users`` (OWNER).
* The last remaining OWNER of a company can neither demote itself nor be
  deactivated — a company always keeps at least one OWNER.
* Privilege fields (``is_superuser``/``is_staff``) are never writable here.
"""

from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import User
from core.permissions import ROLE_OWNER, normalize_role
from core.scope import company_capabilities, resolve_effective_company


class CanManageCompanyUsers(permissions.BasePermission):
    """Grant in-app user management to OWNERs and to provisioning tiers.

    Satisfied by the intra-company ``manage_users`` capability (OWNER) OR by the
    tier ``create_users`` capability (developer/superuser) — so a developer can
    manage a child tenant's users via ``X-Acting-Company`` exactly as it already
    provisions them, while a plain ADMIN/OPERATOR/VIEWER is denied.
    """

    message = "User management requires owner or developer privileges."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not (user and getattr(user, "is_authenticated", False)):
            return False
        caps = company_capabilities(user)
        return bool(caps.get("manage_users") or caps.get("create_users"))


class CompanyUserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "role", "is_active", "date_joined"]
        read_only_fields = fields

    def get_role(self, obj):
        return normalize_role(getattr(obj, "role", None))


class CompanyUserViewSet(viewsets.ReadOnlyModelViewSet):
    """List + manage the users of the caller's effective company (OWNER only)."""

    serializer_class = CompanyUserSerializer
    permission_classes = [CanManageCompanyUsers]

    def _effective_company(self):
        company = resolve_effective_company(self.request)
        if company is None:
            raise PermissionDenied("Authenticated company context required.")
        return company

    def get_queryset(self):
        company = resolve_effective_company(self.request)
        if company is None:
            return User.objects.none()
        return User.objects.filter(company=company).order_by("username")

    def _owner_count(self, company, exclude_id=None):
        qs = User.objects.filter(company=company, is_active=True)
        if exclude_id is not None:
            qs = qs.exclude(id=exclude_id)
        return sum(1 for u in qs if normalize_role(u.role) == ROLE_OWNER)

    @action(detail=True, methods=["patch"], url_path="role")
    def set_role(self, request, pk=None):
        """Change a member's role. Cannot demote the company's last active OWNER."""
        company = self._effective_company()
        target = User.objects.filter(company=company, pk=pk).first()
        if target is None:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        new_role = request.data.get("role")
        valid = {choice.value for choice in User.Role}
        if new_role not in valid:
            raise ValidationError({"role": f"Role must be one of {sorted(valid)}."})

        currently_owner = normalize_role(target.role) == ROLE_OWNER
        if currently_owner and new_role != ROLE_OWNER:
            # Demoting an owner: refuse if it would leave the company ownerless.
            if self._owner_count(company, exclude_id=target.id) == 0:
                raise ValidationError({"role": "Cannot demote the last owner of the company."})

        target.role = new_role
        target.save(update_fields=["role"])
        return Response(CompanyUserSerializer(target).data)

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        """Offboard a member (``is_active=False``). Cannot disable the last OWNER."""
        company = self._effective_company()
        target = User.objects.filter(company=company, pk=pk).first()
        if target is None:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if (
            normalize_role(target.role) == ROLE_OWNER
            and self._owner_count(company, exclude_id=target.id) == 0
        ):
            raise ValidationError({"detail": "Cannot deactivate the last owner of the company."})

        target.is_active = False
        target.save(update_fields=["is_active"])
        return Response(CompanyUserSerializer(target).data)

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        """Re-enable a previously offboarded member."""
        company = self._effective_company()
        target = User.objects.filter(company=company, pk=pk).first()
        if target is None:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        target.is_active = True
        target.save(update_fields=["is_active"])
        return Response(CompanyUserSerializer(target).data)
