'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function ProjectDashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-72" />
        <div className="flex gap-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Card key={idx} className="shadow-sm">
            <CardContent className="py-8">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 py-6">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 py-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Skeleton key={idx} className="h-20 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 py-6">
          {Array.from({ length: 2 }).map((_, idx) => (
            <Skeleton key={idx} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, idx) => (
          <Card key={idx}>
            <CardContent className="space-y-4 py-6">
              {Array.from({ length: 4 }).map((__, innerIdx) => (
                <Skeleton key={innerIdx} className="h-6 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
