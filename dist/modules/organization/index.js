"use strict";
/**
 * Organization Module
 *
 * Exports organization and department services, types, and validations.
 *
 * @module modules/organization
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDeptSchema = exports.updateDeptMemberSchema = exports.memberQuotasSchema = exports.deptQuotasSchema = exports.createDeptSchema = exports.addDeptMemberSchema = exports.departmentService = exports.updateOrgSchema = exports.updateMemberRoleSchema = exports.transferOwnershipSchema = exports.inviteMemberSchema = exports.createOrgSchema = exports.organizationService = void 0;
// Organization Service
var organization_service_1 = require("./organization.service");
Object.defineProperty(exports, "organizationService", { enumerable: true, get: function () { return organization_service_1.organizationService; } });
var organization_validation_1 = require("./organization.validation");
Object.defineProperty(exports, "createOrgSchema", { enumerable: true, get: function () { return organization_validation_1.createOrgSchema; } });
Object.defineProperty(exports, "inviteMemberSchema", { enumerable: true, get: function () { return organization_validation_1.inviteMemberSchema; } });
Object.defineProperty(exports, "transferOwnershipSchema", { enumerable: true, get: function () { return organization_validation_1.transferOwnershipSchema; } });
Object.defineProperty(exports, "updateMemberRoleSchema", { enumerable: true, get: function () { return organization_validation_1.updateMemberRoleSchema; } });
Object.defineProperty(exports, "updateOrgSchema", { enumerable: true, get: function () { return organization_validation_1.updateOrgSchema; } });
// Department Service
var department_service_1 = require("./department.service");
Object.defineProperty(exports, "departmentService", { enumerable: true, get: function () { return department_service_1.departmentService; } });
var department_validation_1 = require("./department.validation");
Object.defineProperty(exports, "addDeptMemberSchema", { enumerable: true, get: function () { return department_validation_1.addDeptMemberSchema; } });
Object.defineProperty(exports, "createDeptSchema", { enumerable: true, get: function () { return department_validation_1.createDeptSchema; } });
Object.defineProperty(exports, "deptQuotasSchema", { enumerable: true, get: function () { return department_validation_1.deptQuotasSchema; } });
Object.defineProperty(exports, "memberQuotasSchema", { enumerable: true, get: function () { return department_validation_1.memberQuotasSchema; } });
Object.defineProperty(exports, "updateDeptMemberSchema", { enumerable: true, get: function () { return department_validation_1.updateDeptMemberSchema; } });
Object.defineProperty(exports, "updateDeptSchema", { enumerable: true, get: function () { return department_validation_1.updateDeptSchema; } });
//# sourceMappingURL=index.js.map