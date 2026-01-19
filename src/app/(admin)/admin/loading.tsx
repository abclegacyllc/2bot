import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-8 w-48 bg-muted" />
        <Skeleton className="h-4 w-64 bg-muted mt-2" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-20 bg-muted" />
              <Skeleton className="h-4 w-4 bg-muted" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24 bg-muted" />
              <Skeleton className="h-3 w-32 bg-muted mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail cards skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <Skeleton className="h-6 w-40 bg-muted" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-5 w-24 bg-muted" />
                <Skeleton className="h-5 w-12 bg-muted" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader>
            <Skeleton className="h-6 w-40 bg-muted" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-5 w-24 bg-muted" />
                <Skeleton className="h-5 w-12 bg-muted" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
