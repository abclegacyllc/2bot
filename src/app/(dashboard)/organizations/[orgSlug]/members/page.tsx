"use client";

/**
 * Organization Members Page (Slug-based URL)
 *
 * Manage organization members: invite, change roles, remove.
 * Uses useOrganization hook to resolve slug to org ID.
 *
 * @module app/(dashboard)/organizations/[orgSlug]/members/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useOrganization, useOrgUrls } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Clock, Loader2, Mail, RefreshCw, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Invite validation schema
const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["ORG_ADMIN", "ORG_MEMBER"]),
});

type InviteInput = z.infer<typeof inviteSchema>;

// Member type from API
interface Member {
  id: string;
  role: "ORG_OWNER" | "ORG_ADMIN" | "ORG_MEMBER";
  status: "ACTIVE" | "PENDING" | "INACTIVE";
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  invitedAt: string;
  joinedAt: string | null;
}

// Pending invite type from API
interface PendingInvite {
  id: string;
  email: string;
  role: "ORG_OWNER" | "ORG_ADMIN" | "ORG_MEMBER";
  invitedBy: string;
  inviterEmail: string | null;
  expiresAt: string;
  createdAt: string;
  resendCount: number;
  maxResends: number;
  status: "PENDING" | "DECLINED" | "ACCEPTED" | "EXPIRED";
  declinedAt: string | null;
}

function formatRole(role: string): string {
  return role.replace("ORG_", "");
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email[0]?.toUpperCase() || "?";
}

/**
 * Organization not found component
 */
function OrgNotFound() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="border-border bg-card/50">
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium text-foreground mb-2">Organization not found</h3>
            <p className="text-muted-foreground mb-4">
              The organization you're looking for doesn't exist or you don't have access to it.
            </p>
            <Link href="/">
              <Button variant="outline" className="border-border">
                ← Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MembersContent() {
  const { token, user } = useAuth();
  const { orgId, orgName, orgRole, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();
  
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "ORG_MEMBER",
    },
  });

  // Fetch members
  const fetchMembers = useCallback(async () => {
    if (!orgId || !token) return;

    try {
      setIsLoading(true);
      const [membersResponse, invitesResponse] = await Promise.all([
        fetch(apiUrl(`/orgs/${orgId}/members`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl(`/orgs/${orgId}/invites`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!membersResponse.ok) {
        throw new Error("Failed to fetch members");
      }

      const membersResult = await membersResponse.json();
      setMembers(membersResult.data || []);

      if (invitesResponse.ok) {
        const invitesResult = await invitesResponse.json();
        setPendingInvites(invitesResult.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setIsLoading(false);
    }
  }, [orgId, token]);

  useEffect(() => {
    if (isFound && orgId) {
      fetchMembers();
    }
  }, [isFound, orgId, fetchMembers]);

  const canInvite = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
  const canChangeRole = orgRole === "ORG_OWNER";
  const canRemove = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

  const onInvite = async (data: InviteInput) => {
    if (!orgId || !token) return;

    try {
      setIsInviting(true);
      setError(null);

      const response = await fetch(apiUrl(`/orgs/${orgId}/members`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to invite member");
      }

      form.reset();
      setInviteDialogOpen(false);
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite member");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    if (!orgId || !token) return;

    try {
      setError(null);
      const response = await fetch(apiUrl(`/orgs/${orgId}/members/${memberId}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to update role");
      }

      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!orgId || !token) return;
    if (!confirm("Are you sure you want to remove this member?")) return;

    try {
      setError(null);
      const response = await fetch(apiUrl(`/orgs/${orgId}/members/${memberId}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to remove member");
      }

      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!orgId || !token) return;
    if (!confirm("Are you sure you want to cancel this invitation?")) return;

    try {
      setError(null);
      setCancellingId(inviteId);
      const response = await fetch(apiUrl(`/orgs/${orgId}/invites/${inviteId}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to cancel invitation");
      }

      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel invitation");
    } finally {
      setCancellingId(null);
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    if (!orgId || !token) return;

    try {
      setError(null);
      setResendingId(inviteId);
      const response = await fetch(apiUrl(`/orgs/${orgId}/invites/${inviteId}/resend`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to resend invitation");
      }

      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend invitation");
    } finally {
      setResendingId(null);
    }
  };

  // Show loading while resolving org
  if (orgLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Show not found if org doesn't exist
  if (!isFound || !orgId) {
    return <OrgNotFound />;
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={buildOrgUrl("/")}>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Members</h1>
              <p className="text-muted-foreground">
                Manage {orgName ? `${orgName}'s` : "organization"} members and invitations
              </p>
            </div>
          </div>
          {canInvite ? (
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Invite Member</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Send an invitation to join your organization
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onInvite)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Email Address</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              placeholder="member@example.com"
                              disabled={isInviting}
                              className="bg-muted border-border text-foreground"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Role</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            disabled={isInviting}
                          >
                            <FormControl>
                              <SelectTrigger className="bg-muted border-border text-foreground">
                                <SelectValue placeholder="Select a role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-muted border-border">
                              <SelectItem value="ORG_MEMBER">Member</SelectItem>
                              <SelectItem value="ORG_ADMIN">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="submit" disabled={isInviting}>
                        {isInviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        <Mail className="mr-2 h-4 w-4" />
                        Send Invitation
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>

        {error ? (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        ) : null}

        {/* Members Table */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground">Organization Members</CardTitle>
            <CardDescription className="text-muted-foreground">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No members found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Member</TableHead>
                    <TableHead className="text-muted-foreground">Role</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Joined</TableHead>
                    <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id} className="border-border hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={member.user.image || undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {getInitials(member.user.name, member.user.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-foreground">
                              {member.user.name || "Unnamed"}
                            </div>
                            <div className="text-sm text-muted-foreground">{member.user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canChangeRole &&
                        member.role !== "ORG_OWNER" &&
                        member.user.id !== user?.id ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) => handleRoleChange(member.id, value)}
                          >
                            <SelectTrigger className="w-32 bg-muted border-border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-muted border-border">
                              <SelectItem value="ORG_MEMBER">Member</SelectItem>
                              <SelectItem value="ORG_ADMIN">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant={
                              member.role === "ORG_OWNER"
                                ? "default"
                                : member.role === "ORG_ADMIN"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {formatRole(member.role)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            member.status === "ACTIVE"
                              ? "default"
                              : member.status === "PENDING"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {member.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {member.joinedAt
                          ? new Date(member.joinedAt).toLocaleDateString()
                          : "Pending"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canRemove && member.role !== "ORG_OWNER" && member.user.id !== user?.id ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemove(member.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pending Invitations */}
        {pendingInvites.length > 0 ? (
          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                Pending Invitations
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {pendingInvites.filter((i) => i.status === "PENDING").length} pending,{" "}
                {pendingInvites.filter((i) => i.status === "DECLINED").length} declined
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Email</TableHead>
                    <TableHead className="text-muted-foreground">Role</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Date</TableHead>
                    <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.map((invite) => (
                    <TableRow
                      key={invite.id}
                      className={`border-border hover:bg-muted/50 ${invite.status === "DECLINED" ? "opacity-60" : ""}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback
                              className={
                                invite.status === "DECLINED"
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-orange-500/10 text-orange-500"
                              }
                            >
                              {invite.email[0]?.toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-foreground">{invite.email}</div>
                            <div className="text-sm text-muted-foreground">
                              Invited by {invite.inviterEmail || "Unknown"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatRole(invite.role)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={invite.status === "DECLINED" ? "destructive" : "secondary"}>
                          {invite.status === "DECLINED" ? "Declined" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {invite.status === "DECLINED" && invite.declinedAt
                          ? `Declined ${new Date(invite.declinedAt).toLocaleDateString()}`
                          : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-1">
                          {invite.status === "PENDING" && (
                            <>
                              {invite.resendCount > 0 && (
                                <span className="text-xs text-muted-foreground mr-1">
                                  {invite.resendCount}/{invite.maxResends}
                                </span>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleResendInvite(invite.id)}
                                disabled={
                                  resendingId === invite.id ||
                                  invite.resendCount >= invite.maxResends
                                }
                                className="text-muted-foreground hover:text-primary disabled:opacity-50"
                                title={
                                  invite.resendCount >= invite.maxResends
                                    ? "Maximum resend limit reached"
                                    : `Resend invitation (${invite.maxResends - invite.resendCount} left)`
                                }
                              >
                                {resendingId === invite.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCancelInvite(invite.id)}
                            disabled={cancellingId === invite.id}
                            className="text-muted-foreground hover:text-destructive"
                            title={
                              invite.status === "DECLINED"
                                ? "Remove declined invite"
                                : "Cancel invitation"
                            }
                          >
                            {cancellingId === invite.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export default function OrgMembersPage() {
  return (
    <ProtectedRoute>
      <MembersContent />
    </ProtectedRoute>
  );
}
