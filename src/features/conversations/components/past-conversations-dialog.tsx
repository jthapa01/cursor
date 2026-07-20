"use client";

import { Loader2Icon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useConversations } from "../hooks/use-conversations";
import { Id } from "../../../../convex/_generated/dataModel";

interface PastConversationDialogProps {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (conversationId: Id<"conversations">) => void;
};

export const PastConversationsDialog = ({
  projectId,
  open,
  onOpenChange,
  onSelect,
}: PastConversationDialogProps) => {
  const conversations = useConversations(projectId);

  // `useQuery` returns `undefined` while the data is still loading.
  const isLoading = conversations === undefined;

  const handleSelect = (conversationId: Id<"conversations">) => {
    onSelect(conversationId);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Past Conversations" description="Search and select a past conversation">
      <CommandInput placeholder="Search conversations..." />
      <CommandList>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Loading conversations...
          </div>
        ) : (
          <>
            <CommandEmpty>No conversations found.</CommandEmpty>
            <CommandGroup heading="Past Conversations">
              {conversations.map((conversation) => (
                <CommandItem
                  key={conversation._id}
                  value={`${conversation.title}-${conversation._id}`}
                  onSelect={() => handleSelect(conversation._id)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span>{conversation.title}</span>
                    <span>
                      {formatDistanceToNow(new Date(conversation.updatedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
};