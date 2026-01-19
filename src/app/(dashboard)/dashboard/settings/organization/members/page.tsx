"use client";

/**
 * Organization Members Page
 *
 * Manage organization members: invite, change roles, remove.
 * Permissions based on user's org role.
 *
 * @module app/dashboard/settings/organization/members/page
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
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, Mail, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function MembersContent() {
  const router = useRouter();
  const { context, token, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "ORG_MEMBER",
    },
  });

  // Redirect if not in org context
  useEffect(() => {
    if (context.type !== "organization") {
      router.push("/dashboard/settings");
    }
  }, [context, router]);

  // Fetch members
  const fetchMembers = useCallback(async () => {
    if (!context.organizationId || !token) return;

    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/organizations/${context.organizationId}/members`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch members");
      }

      const result = await response.json();
      setMembers(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setIsLoading(false);
    }
  }, [context.organizationId, token]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const canInvite =
    context.orgRole === "ORG_OWNER" || context.orgRole === "ORG_ADMIN";
  const canChangeRole = context.orgRole === "ORG_OWNER";
  const canRemove =
    context.orgRole === "ORG_OWNER" || context.orgRole === "ORG_ADMIN";

  const onInvite = async (data: InviteInput) => {
    if (!context.organizationId || !token) return;

    try {
      setIsInviting(true);
      setError(null);

      const response = await fetch(
        `/api/organizations/${context.organizationId}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        }
      );

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
    if (!context.organizationId || !token) return;

    try {
      setError(null);
      const response = await fetch(
        `/api/organizations/${context.organizationId}/members/${memberId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ role: newRole }),
        }
      );

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
    if (!context.organizationId || !token) return;

    if (!confirm("Are you sure you want to remove this member?")) return;

    try {
      setError(null);
      const response = await fetch(
        `/api/organizations/${context.organizationId}/members/${memberId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to remove member");
      }

      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  if (context.type !== "organization") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/settings/organization">
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
                Manage organization members and invitations
              </p>
            </div>
          </div>
          {canInvite ? <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
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
                  <form
                    onSubmit={form.handleSubmit(onInvite)}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">
                            Email Address
                          </FormLabel>
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
            </Dialog> : null}
        </div>

        {error ? <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md">
            {error}
          </div> : null}

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
              <div className="text-center py-8 text-muted-foreground">
                No members found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Member</TableHead>
                    <TableHead className="text-muted-foreground">Role</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Joined</TableHead>
                    <TableHead className="text-right text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow
                      key={member.id}
                      className="border-border hover:bg-muted/50"
                    >
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
                            <div className="text-sm text-muted-foreground">
                              {member.user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canChangeRole &&
                        member.role !== "ORG_OWNER" &&
                        member.user.id !== user?.id ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              handleRoleChange(member.id, value)
                            }
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
                        {canRemove &&
                          member.role !== "ORG_OWNER" &&
                          member.user.id !== user?.id ? <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemove(member.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function MembersPage() {
  return (
    <ProtectedRoute>
      <MembersContent />
    </ProtectedRoute>
  );
}
