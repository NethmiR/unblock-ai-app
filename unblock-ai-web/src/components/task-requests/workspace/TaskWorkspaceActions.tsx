"use client";
import { Menu } from "@/components/ui/Menu";
import { lifecycleMenuItems } from "@/lib/task-request/task-request-menu-items";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";
import type { TaskRequestActions } from "@/lib/hooks/useTaskRequestActions";
import type { MenuItem } from "@/types/menu";
import type { TaskDto } from "@/types/task";

const COPY = TASK_REQUEST_COPY.actions;

export function TaskWorkspaceActions({ task, actions }: { task: TaskDto; actions: TaskRequestActions }) {
  const items: MenuItem[] = [
    ...(task.available_actions.can_download_transcript
      ? [{ label: COPY.downloadTranscript, icon: IconName.DOWNLOAD, onSelect: () => void actions.downloadTranscript(task) }]
      : []),
    ...lifecycleMenuItems(task, task.available_actions, actions),
  ];
  return <Menu items={items} label={COPY.menuLabel} />;
}
