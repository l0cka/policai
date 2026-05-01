import {
  Bot,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Trash2,
  Link as LinkIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JURISDICTION_NAMES, POLICY_TYPE_NAMES } from '@/types';

export interface PendingItem {
  id: string;
  title: string;
  source: string;
  discoveredAt: string;
  status: 'pending_review' | 'approved' | 'published' | 'rejected';
  aiAnalysis: {
    isRelevant: boolean;
    relevanceScore: number;
    suggestedType: string | null;
    suggestedJurisdiction: string | null;
    summary: string;
    tags?: string[];
    agencies?: string[];
  };
}

interface ReviewTabProps {
  pendingContent: PendingItem[];
  filteredContent: PendingItem[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  filterRelevance: 'all' | 'high' | 'medium' | 'low';
  onFilterRelevanceChange: (value: 'all' | 'high' | 'medium' | 'low') => void;
  selectedItems: Set<string>;
  onToggleItemSelection: (id: string) => void;
  onToggleSelectAll: () => void;
  onFetchPendingContent: () => void;
  onApprove: (item: PendingItem) => void;
  onReject: (item: PendingItem) => void;
  onDelete: (id: string) => void;
  onEditAndApprove: (item: PendingItem) => void;
  onBatchApprove: () => void;
  onBatchReject: () => void;
  onClearSelection: () => void;
  onOpenAnalyseUrl: () => void;
}

export function ReviewTab({
  pendingContent,
  filteredContent,
  searchQuery,
  onSearchQueryChange,
  filterRelevance,
  onFilterRelevanceChange,
  selectedItems,
  onToggleItemSelection,
  onToggleSelectAll,
  onFetchPendingContent,
  onApprove,
  onReject,
  onDelete,
  onEditAndApprove,
  onBatchApprove,
  onBatchReject,
  onClearSelection,
  onOpenAnalyseUrl,
}: ReviewTabProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                AI-Suggested Content
              </CardTitle>
              <CardDescription>
                Review content discovered by the AI agent and approve or reject
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onFetchPendingContent}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Search and Filters */}
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search content..."
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterRelevance} onValueChange={(value: string) => onFilterRelevanceChange(value as 'all' | 'high' | 'medium' | 'low')}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by relevance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Relevance</SelectItem>
                <SelectItem value="high">High (&gt;80%)</SelectItem>
                <SelectItem value="medium">Medium (50-80%)</SelectItem>
                <SelectItem value="low">Low (&lt;50%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Batch Actions */}
          {selectedItems.size > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 p-3 bg-primary/10 rounded-lg">
              <span className="text-sm font-medium">
                {selectedItems.size} selected
              </span>
              <div className="flex flex-wrap gap-2 ml-auto">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={onBatchApprove}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700"
                  onClick={onBatchReject}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject All
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClearSelection}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[350px] sm:h-[500px]">
            {filteredContent.length > 0 && (
              <div className="mb-4 flex items-center gap-2 px-1">
                <input
                  type="checkbox"
                  checked={selectedItems.size === filteredContent.length && filteredContent.length > 0}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-muted-foreground">Select All</span>
              </div>
            )}
            <div className="space-y-4">
              {filteredContent.map((item) => (
                <Card key={item.id} className="border-l-4 border-l-yellow-400">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => onToggleItemSelection(item.id)}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <div className="flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold">{item.title}</h3>
                            <a
                              href={item.source}
                              className="text-sm text-primary hover:underline block truncate"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {item.source}
                            </a>
                            <p className="text-xs text-muted-foreground mt-1">
                              Discovered {new Date(item.discoveredAt).toLocaleString('en-AU')}
                            </p>
                          </div>
                          <Badge
                            variant={item.aiAnalysis.isRelevant ? 'default' : 'secondary'}
                            className="shrink-0 self-start"
                          >
                            {Math.round(item.aiAnalysis.relevanceScore * 100)}% relevant
                          </Badge>
                        </div>

                        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2 text-sm font-medium mb-2">
                            <Bot className="h-4 w-4" />
                            AI Analysis
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {item.aiAnalysis.summary}
                          </p>
                          {(item.aiAnalysis.suggestedType || item.aiAnalysis.suggestedJurisdiction) && (
                            <div className="mt-2 flex gap-2 flex-wrap">
                              {item.aiAnalysis.suggestedType && (
                                <Badge variant="outline">
                                  Type: {POLICY_TYPE_NAMES[item.aiAnalysis.suggestedType as keyof typeof POLICY_TYPE_NAMES] || item.aiAnalysis.suggestedType}
                                </Badge>
                              )}
                              {item.aiAnalysis.suggestedJurisdiction && (
                                <Badge variant="outline">
                                  {JURISDICTION_NAMES[item.aiAnalysis.suggestedJurisdiction as keyof typeof JURISDICTION_NAMES] || item.aiAnalysis.suggestedJurisdiction}
                                </Badge>
                              )}
                            </div>
                          )}
                          {item.aiAnalysis.tags && item.aiAnalysis.tags.length > 0 && (
                            <div className="mt-2 flex gap-1 flex-wrap">
                              {item.aiAnalysis.tags.slice(0, 5).map((tag, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => onApprove(item)}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onEditAndApprove(item)}
                          >
                            Edit & Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => onReject(item)}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive ml-auto"
                            onClick={() => onDelete(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {filteredContent.length === 0 && (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <p className="text-muted-foreground">
                    {pendingContent.length === 0
                      ? 'No pending content to review'
                      : 'No content matches your filters'}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={onOpenAnalyseUrl}
                  >
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Analyse a URL
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
