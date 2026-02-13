"use client";

/**
 * Admin Organization Detail Page
 *
 * View and manage a single organization:
 * - Organization info (plan, status, owner)
 * - Members list
 * - Departments list
 * - Gateways list
 * - Credit wallet
 * - Edit, suspend actions
 *
 * @module app/(admin)/admin/organizations/[id]/page
 */

import { PageHeader } from "@/components/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermission } from "@/hooks/use-permission";
import { adminApiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    Bot,
    Building2,
    Coins,
    Folder,
    Save,
    User,
    Users
} from "lucide-react";
import { use, useCallback, useEffect, useState } from "react";

interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    email: string;
    name: string;
  } | null;
  creditWallet: {
    id: string;
    balance: number;
    lifetime: number;
    monthlyAllocation: number;
    monthlyUsed: number;
  } | null;
  members: Array<{
    id: string;
    userId: string;
    role: string;
    status: string;
    joinedAt: string | null;
    user: {
      id: string;
      email: string;
      name: string;
    };
  }>;
  departments: Array<{
    id: string;
    name: string;
    memberCount: number;
  }>;
  gateways: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
  }>;
}

interface OrgDetailResponse {
  success: boolean;
  data: {
    organization: OrganizationDetail;
  };
}

const PLAN_OPTIONS = ["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"];

export default function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { token } = useAuth();
  const { id } = use(params);
  const canWrite = usePermission('admin:organizations:write');
  const canDelete = usePermission('admin:organizations:delete');
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editedPlan, setEditedPlan] = useState<string>('');
  const [editedActive, setEditedActive] = useState<boolean>(true);

  const fetchOrganization = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(adminApiUrl(`/organizations/${id}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch organization');

      const json: OrgDetailResponse = await res.json();
      setOrg(json.data.organization);
      setEditedPlan(json.data.organization.plan);
      setEditedActive(json.data.organization.isActive);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  const handleSave = async () => {
    if (!token || !org) return;
    setSaving(true);

    try {
      const res = await fetch(adminApiUrl(`/organizations/${id}`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan: editedPlan,
          isActive: editedActive,
        }),
      });

      if (!res.ok) throw new Error('Failed to update organization');

      await fetchOrganization();
      setEditMode(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save organization');
    } finally {
      setSaving(false);
    }
  };

  const handleSuspend = async () => {
    if (!token || !org) return;
    
    const confirmed = confirm(
      `Are you sure you want to suspend "${org.name}"? This will deactivate the organization and all its members.`
    );
    if (!confirmed) return;

    const reason = prompt('Reason for suspension:');
    if (!reason) return;

    setSaving(true);

    try {
      const res = await fetch(adminApiUrl(`/organizations/${id}/suspend`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) throw new Error('Failed to suspend organization');

      await fetchOrganization();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to suspend organization');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading organization...</div>
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="p-6">
        <div className="text-red-500">Error: {error || 'Organization not found'}</div>
      </div>
    );
  }

  const isDirty = editedPlan !== org.plan || editedActive !== org.isActive;

  return (
    <div className="space-y-6">
      <PageHeader 
        title={org.name}
        description={org.slug}
        icon={<Building2 className="h-6 w-6 text-purple-500" />}
        breadcrumbs={[{ label: "Organizations", href: "/admin/organizations" }]}
        actions={
          <div className="flex gap-2">
            {editMode ? (
              <>
                <Button
                  onClick={handleSave}
                  disabled={saving || !isDirty || !canWrite}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditMode(false);
                    setEditedPlan(org.plan);
                    setEditedActive(org.isActive);
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {canWrite ? <Button variant="outline" onClick={() => setEditMode(true)}>
                    Edit
                  </Button> : null}
                {canDelete ? <Button
                    variant="destructive"
                    onClick={handleSuspend}
                    disabled={!org.isActive}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Suspend
                  </Button> : null}
              </>
            )}
          </div>
        }
      />

      {/* Organization Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Plan</label>
              {editMode ? (
                <Select value={editedPlan} onValueChange={setEditedPlan} disabled={!canWrite}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map((plan) => (
                      <SelectItem key={plan} value={plan}>
                        {plan}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-2">
                  <Badge>{org.plan}</Badge>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Status</label>
              {editMode ? (
                <div className="flex items-center gap-3 mt-2">
                  <Switch
                    checked={editedActive}
                    onCheckedChange={setEditedActive}
                    disabled={!canWrite}
                  />
                  <span className="text-foreground">
                    {editedActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ) : (
                <div className="mt-2">
                  <Badge variant={org.isActive ? 'default' : 'secondary'}>
                    {org.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Owner</label>
              <div className="mt-2 text-foreground">
                {org.owner ? (
                  <>
                    <div className="font-medium">{org.owner.name || org.owner.email}</div>
                    <div className="text-sm text-muted-foreground">{org.owner.email}</div>
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">No owner set</div>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Created</label>
              <div className="mt-2 text-foreground">
                {new Date(org.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit Wallet Card */}
      {org.creditWallet ? <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-yellow-500" />
              Credit Wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Balance</div>
                <div className="text-2xl font-bold text-foreground">
                  {org.creditWallet.balance.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Lifetime</div>
                <div className="text-xl font-semibold text-green-500">
                  {org.creditWallet.lifetime.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Monthly Used</div>
                <div className="text-xl font-semibold text-red-500">
                  {org.creditWallet.monthlyUsed.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Monthly Allocation</div>
                <div className="text-xl font-semibold text-blue-500">
                  {org.creditWallet.monthlyAllocation.toLocaleString()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card> : null}

      {/* Tabs */}
      <Tabs defaultValue="members" className="w-full">
        <TabsList>
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-2" />
            Members ({org.members.length})
          </TabsTrigger>
          <TabsTrigger value="departments">
            <Folder className="h-4 w-4 mr-2" />
            Departments ({org.departments.length})
          </TabsTrigger>
          <TabsTrigger value="gateways">
            <Bot className="h-4 w-4 mr-2" />
            Gateways ({org.gateways.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Organization Members</CardTitle>
              <CardDescription>All members of this organization</CardDescription>
            </CardHeader>
            <CardContent>
              {org.members.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No members found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          User
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          Role
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          Joined
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {org.members.map((member) => (
                        <tr key={member.id} className="border-b border-border">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-blue-500" />
                              <div>
                                <div className="font-medium text-foreground">
                                  {member.user.name || member.user.email}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {member.user.email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">{member.role}</Badge>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={member.status === 'active' ? 'default' : 'secondary'}>
                              {member.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {member.joinedAt 
                              ? new Date(member.joinedAt).toLocaleDateString()
                              : 'Not joined'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments">
          <Card>
            <CardHeader>
              <CardTitle>Departments</CardTitle>
              <CardDescription>Organizational departments</CardDescription>
            </CardHeader>
            <CardContent>
              {org.departments.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No departments found
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {org.departments.map((dept) => (
                    <Card key={dept.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                          <Folder className="h-8 w-8 text-purple-500" />
                          <div className="flex-1">
                            <div className="font-medium text-foreground">{dept.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {dept.memberCount} members
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gateways">
          <Card>
            <CardHeader>
              <CardTitle>Gateways</CardTitle>
              <CardDescription>Organization gateways</CardDescription>
            </CardHeader>
            <CardContent>
              {org.gateways.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No gateways found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          Name
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          Type
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {org.gateways.map((gateway) => (
                        <tr key={gateway.id} className="border-b border-border">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4 text-blue-500" />
                              <span className="font-medium text-foreground">
                                {gateway.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-foreground">{gateway.type}</td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={
                                gateway.status === 'connected' ? 'default' : 'secondary'
                              }
                            >
                              {gateway.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
