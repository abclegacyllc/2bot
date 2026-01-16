"use client";

/**
 * Organization Departments Page
 *
 * Manage organization departments: create, edit, delete, assign members.
 * Permissions based on user's org role (ADMIN+ can manage).
 *
 * @module app/dashboard/settings/organization/departments/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
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
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    ArrowLeft,
    Building,
    Edit2,
    Loader2,
    Plus,
    Trash2,
    Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Department validation schema
const departmentSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  description: z
    .string()
    .max(500, "Description must be at most 500 characters")
    .optional(),
});

type DepartmentInput = z.infer<typeof departmentSchema>;

// Department type from API
interface Department {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

function DepartmentsContent() {
  const router = useRouter();
  const { context, token } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] =
    useState<Department | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createForm = useForm<DepartmentInput>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const editForm = useForm<DepartmentInput>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Redirect if not in org context
  useEffect(() => {
    if (context.type !== "organization") {
      router.push("/dashboard/settings");
    }
  }, [context, router]);

  // Fetch departments
  const fetchDepartments = useCallback(async () => {
    if (!context.organizationId || !token) return;

    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/organizations/${context.organizationId}/departments`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch departments");
      }

      const result = await response.json();
      setDepartments(result.data || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load departments"
      );
    } finally {
      setIsLoading(false);
    }
  }, [context.organizationId, token]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const canManage =
    context.orgRole === "ORG_OWNER" || context.orgRole === "ORG_ADMIN";

  const onCreateDepartment = async (data: DepartmentInput) => {
    if (!context.organizationId || !token) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/organizations/${context.organizationId}/departments`,
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
        throw new Error(
          result.error?.message || "Failed to create department"
        );
      }

      createForm.reset();
      setCreateDialogOpen(false);
      await fetchDepartments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create department"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const onEditDepartment = async (data: DepartmentInput) => {
    if (!context.organizationId || !token || !selectedDepartment) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/organizations/${context.organizationId}/departments/${selectedDepartment.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          result.error?.message || "Failed to update department"
        );
      }

      editForm.reset();
      setEditDialogOpen(false);
      setSelectedDepartment(null);
      await fetchDepartments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update department"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!context.organizationId || !token || !selectedDepartment) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/organizations/${context.organizationId}/departments/${selectedDepartment.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          result.error?.message || "Failed to delete department"
        );
      }

      setDeleteDialogOpen(false);
      setSelectedDepartment(null);
      await fetchDepartments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete department"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (dept: Department) => {
    setSelectedDepartment(dept);
    editForm.reset({
      name: dept.name,
      description: dept.description || "",
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (dept: Department) => {
    setSelectedDepartment(dept);
    setDeleteDialogOpen(true);
  };

  if (context.type !== "organization") {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/settings/organization">
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-white">Departments</h1>
              <p className="text-slate-400">
                Manage organization departments and teams
              </p>
            </div>
          </div>
          {canManage ? <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Department
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-900 border-slate-800">
                <DialogHeader>
                  <DialogTitle className="text-white">
                    Create Department
                  </DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Add a new department to your organization
                  </DialogDescription>
                </DialogHeader>
                <Form {...createForm}>
                  <form
                    onSubmit={createForm.handleSubmit(onCreateDepartment)}
                    className="space-y-4"
                  >
                    <FormField
                      control={createForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-200">
                            Department Name
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Engineering"
                              disabled={isSubmitting}
                              className="bg-slate-800 border-slate-700 text-white"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-200">
                            Description
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Describe what this department does..."
                              disabled={isSubmitting}
                              className="bg-slate-800 border-slate-700 text-white resize-none"
                              rows={3}
                            />
                          </FormControl>
                          <FormDescription className="text-slate-500">
                            Optional description of this department
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setCreateDialogOpen(false)}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Create
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

        {/* Departments Table */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Building className="h-5 w-5" />
              Departments
            </CardTitle>
            <CardDescription className="text-slate-400">
              {departments.length} department{departments.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : departments.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No departments yet</p>
                {canManage ? <p className="text-sm mt-2">
                    Create your first department to organize your team
                  </p> : null}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Department</TableHead>
                    <TableHead className="text-slate-400">Members</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                    {canManage ? <TableHead className="text-right text-slate-400">
                        Actions
                      </TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((dept) => (
                    <TableRow
                      key={dept.id}
                      className="border-slate-800 hover:bg-slate-800/50"
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium text-white">
                            {dept.name}
                          </div>
                          {dept.description ? <div className="text-sm text-slate-400 truncate max-w-xs">
                              {dept.description}
                            </div> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1">
                          <Users className="h-3 w-3" />
                          {dept.memberCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-400">
                        {new Date(dept.createdAt).toLocaleDateString()}
                      </TableCell>
                      {canManage ? <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(dept)}
                              className="text-slate-400 hover:text-white"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteDialog(dept)}
                              className="text-slate-400 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell> : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white">Edit Department</DialogTitle>
              <DialogDescription className="text-slate-400">
                Update department information
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form
                onSubmit={editForm.handleSubmit(onEditDepartment)}
                className="space-y-4"
              >
                <FormField
                  control={editForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-200">
                        Department Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Engineering"
                          disabled={isSubmitting}
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-200">
                        Description
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Describe what this department does..."
                          disabled={isSubmitting}
                          className="bg-slate-800 border-slate-700 text-white resize-none"
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditDialogOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Changes
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white">Delete Department</DialogTitle>
              <DialogDescription className="text-slate-400">
                Are you sure you want to delete{" "}
                <span className="font-medium text-white">
                  {selectedDepartment?.name}
                </span>
                ? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {selectedDepartment && selectedDepartment.memberCount > 0 ? <div className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 px-4 py-3 rounded-md text-sm">
                This department has {selectedDepartment.memberCount} member
                {selectedDepartment.memberCount !== 1 ? "s" : ""}. They will be
                removed from this department.
              </div> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete Department
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function DepartmentsPage() {
  return (
    <ProtectedRoute>
      <DepartmentsContent />
    </ProtectedRoute>
  );
}
