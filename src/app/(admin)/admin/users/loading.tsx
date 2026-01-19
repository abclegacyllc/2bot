import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminUsersLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-32 bg-muted" />
          <Skeleton className="h-4 w-24 bg-muted mt-2" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-64 bg-muted" />
          <Skeleton className="h-10 w-20 bg-muted" />
        </div>
      </div>

      {/* Filters skeleton */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-6 w-24 bg-muted" />
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 bg-muted" />
        ))}
      </div>

      {/* Table skeleton */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {[...Array(6)].map((_, i) => (
                    <th key={i} className="px-4 py-3 text-left">
                      <Skeleton className="h-4 w-20 bg-muted" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-40 bg-muted" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-24 bg-muted" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 bg-muted" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 bg-muted" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-24 bg-muted" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-24 bg-muted" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
