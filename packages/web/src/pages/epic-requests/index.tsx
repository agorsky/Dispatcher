import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEpicRequests } from '@/hooks/queries/use-epic-requests';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, ThumbsUp, Flame, ThumbsDown, ChevronDown, User, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { EpicRequestStatus, EpicRequestWithReactionCounts } from '@/lib/api/epic-requests';

// Status badge colors based on status
const statusColors: Record<EpicRequestStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  converted: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
};

// Status order for grouping
const statusOrder: EpicRequestStatus[] = ['pending', 'approved', 'converted', 'rejected'];

// Helper to get reaction count for a specific type
function getReactionCount(
  request: EpicRequestWithReactionCounts,
  type: 'like' | 'fire' | 'dislike'
): number {
  const reaction = request.reactionCounts.find((r) => r.reactionType === type);
  return reaction?.count ?? 0;
}

interface RequestCardProps {
  request: EpicRequestWithReactionCounts;
  onClick: () => void;
}

function RequestCard({ request, onClick }: RequestCardProps) {
  const likeCount = getReactionCount(request, 'like');
  const fireCount = getReactionCount(request, 'fire');
  const dislikeCount = getReactionCount(request, 'dislike');

  return (
    <Card
      className="p-4 hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      {/* Header with status and scope */}
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-base font-semibold leading-tight flex-1 pr-2">
          {request.title}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Scope badge */}
          <Badge
            className={cn(
              'text-xs font-medium',
              request.personalScopeId
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            )}
          >
            {request.personalScopeId ? (
              <><User className="h-3 w-3 mr-1" />Personal</>
            ) : (
              <><Users className="h-3 w-3 mr-1" />Team</>
            )}
          </Badge>
          {/* Status badge */}
          <Badge
            className={cn(
              'text-xs font-medium',
              statusColors[request.status]
            )}
          >
            {request.status}
          </Badge>
        </div>
      </div>

      {/* Author and time */}
      <div className="text-sm text-muted-foreground mb-3">
        <span>
          by {request.requestedBy?.name ?? 'Unknown'} •{' '}
          {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
        </span>
      </div>

      {/* Reaction counts */}
      <div className="flex items-center gap-3 text-sm">
        {likeCount > 0 && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <ThumbsUp className="h-4 w-4" />
            <span>{likeCount}</span>
          </div>
        )}
        {fireCount > 0 && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Flame className="h-4 w-4" />
            <span>{fireCount}</span>
          </div>
        )}
        {dislikeCount > 0 && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <ThumbsDown className="h-4 w-4" />
            <span>{dislikeCount}</span>
          </div>
        )}
        {likeCount === 0 && fireCount === 0 && dislikeCount === 0 && (
          <span className="text-muted-foreground">No reactions yet</span>
        )}
      </div>
    </Card>
  );
}

export function EpicRequestsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<EpicRequestStatus[]>(['pending', 'approved']);

  // Fetch all requests (no API-level filtering since API only supports single status)
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useEpicRequests({});

  // Flatten pages and apply client-side filtering (status + search)
  const allRequests = data?.pages.flatMap((page) => page.data) ?? [];
  
  // Filter by selected statuses (if any selected)
  const statusFilteredRequests = selectedStatuses.length > 0
    ? allRequests.filter((req) => selectedStatuses.includes(req.status))
    : allRequests;
  
  // Then filter by search query
  const filteredRequests = searchQuery
    ? statusFilteredRequests.filter((req) =>
        req.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : statusFilteredRequests;

  // Group requests by status
  const groupedRequests = filteredRequests.reduce<Partial<Record<EpicRequestStatus, EpicRequestWithReactionCounts[]>>>(
    (acc, request) => {
      const group = acc[request.status] ?? [];
      group.push(request);
      acc[request.status] = group;
      return acc;
    },
    {}
  );

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl md:text-2xl font-semibold">Epic Requests</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search input */}
        <div className="relative flex-1 min-w-[160px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search requests..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); }}
            className="pl-9"
          />
        </div>

        {/* Status filter - Multi-select */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="w-[220px] justify-between font-normal"
            >
              {selectedStatuses.length === 0
                ? 'All statuses'
                : selectedStatuses.length === 1 && selectedStatuses[0]
                ? `${selectedStatuses[0].charAt(0).toUpperCase()}${selectedStatuses[0].slice(1)}`
                : `${String(selectedStatuses.length)} statuses selected`}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[220px] p-3" align="start">
            <div className="space-y-2" onClick={(e) => { e.stopPropagation(); }}>
              {(['pending', 'approved', 'converted', 'rejected'] as EpicRequestStatus[]).map((status) => (
                <label
                  key={status}
                  className="flex items-center space-x-2 cursor-pointer hover:bg-accent p-2 rounded-md"
                  onClick={(e) => { e.stopPropagation(); }}
                >
                  <Checkbox
                    checked={selectedStatuses.includes(status)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedStatuses([...selectedStatuses, status]);
                      } else {
                        setSelectedStatuses(selectedStatuses.filter((s) => s !== status));
                      }
                    }}
                  />
                  <span className="text-sm capitalize">
                    {status}
                  </span>
                </label>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Request list */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {searchQuery ? 'No requests match your search' : 'No epic requests yet'}
          </p>
        </div>
      ) : (
        <>
          {/* Grouped by status */}
          <div className="space-y-8">
            {statusOrder.map((status) => {
              const requestsInGroup = groupedRequests[status] ?? [];
              
              // Skip empty groups
              if (requestsInGroup.length === 0) {
                return null;
              }

              return (
                <div key={status}>
                  {/* Group header with status badge and count */}
                  <div className="flex items-center gap-2 mb-4">
                    <Badge
                      className={cn(
                        'text-xs font-medium',
                        statusColors[status]
                      )}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      ({requestsInGroup.length})
                    </span>
                  </div>

                  {/* Grid of cards for this status group */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {requestsInGroup.map((request) => (
                      <RequestCard
                        key={request.id}
                        request={request}
                        onClick={() => { void navigate(`/epic-requests/${request.id}`); }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more button */}
          {hasNextPage && (
            <div className="mt-6 text-center">
              <Button
                variant="outline"
                onClick={() => { void fetchNextPage(); }}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
