/**
 * Organization Module
 *
 * Exports organization and department services, types, and validations.
 *
 * @module modules/organization
 */

// Organization Service
export { organizationService } from "./organization.service";
export type {
    CreateOrgRequest,
    InviteMemberRequest,
    MemberWithUser,
    OrgWithRole,
    PendingInvite,
    SafeOrganization,
    UpdateMemberRoleRequest,
    UpdateOrgRequest
} from "./organization.types";
export {
    createOrgSchema,
    inviteMemberSchema,
    transferOwnershipSchema,
    updateMemberRoleSchema,
    updateOrgSchema
} from "./organization.validation";

// Department Service
export { departmentService } from "./department.service";
export type {
    AddDeptMemberRequest,
    CreateDeptRequest,
    DeptMemberWithUser,
    DeptQuotas,
    MemberQuotas,
    SafeDepartment,
    UpdateDeptMemberRequest,
    UpdateDeptRequest
} from "./department.types";
export {
    addDeptMemberSchema,
    createDeptSchema,
    deptQuotasSchema,
    memberQuotasSchema,
    updateDeptMemberSchema,
    updateDeptSchema
} from "./department.validation";

