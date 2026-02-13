export default function OrganizationDetailLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
        <p className="text-muted-foreground text-sm">Loading organization...</p>
      </div>
    </div>
  );
}
