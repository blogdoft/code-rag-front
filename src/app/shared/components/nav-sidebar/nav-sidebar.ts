import { Component, computed, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavLink {
  id: 'rag' | 'projects' | 'reports' | 'settings';
  label: string;
  path: string;
}

const BASE_CLASSES =
  'flex flex-col border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-700 dark:bg-slate-800 md:sticky md:top-14 md:flex md:h-[calc(100vh-3.5rem)] md:shrink-0 md:overflow-y-auto';

@Component({
  selector: 'app-nav-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav-sidebar.html',
})
export class NavSidebar {
  readonly expanded = input.required<boolean>();
  readonly frontVersion = input<string>('');
  readonly apiVersion = input<string>('');
  readonly linkClicked = output<void>();

  protected readonly links: readonly NavLink[] = [
    { id: 'rag', label: 'Rag', path: '/rag' },
    { id: 'projects', label: 'Projects', path: '/projects' },
    { id: 'reports', label: 'Reports', path: '/reports' },
    { id: 'settings', label: 'Settings', path: '/settings' },
  ];

  /**
   * Mobile: fully hidden when collapsed, a full-screen overlay (below the header) when expanded.
   * Desktop (md+): always occupies space, just narrower (icons-only) when collapsed.
   */
  protected readonly asideClasses = computed(() =>
    this.expanded()
      ? `${BASE_CLASSES} fixed inset-x-0 top-14 bottom-0 z-40 w-full md:static md:inset-auto md:top-auto md:w-56`
      : `${BASE_CLASSES} hidden md:flex md:w-16`,
  );

  /** Stacked and centered in the icon rail when collapsed; a right-aligned row when expanded. */
  protected readonly versionFooterClasses = computed(() =>
    this.expanded()
      ? 'mt-auto flex flex-row justify-end gap-2 border-t border-slate-200 px-3 py-3 font-mono text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500'
      : 'mt-auto flex flex-col items-center gap-0.5 border-t border-slate-200 px-2 py-3 font-mono text-[10px] text-slate-400 dark:border-slate-700 dark:text-slate-500',
  );

  /**
   * Side by side, the two versions need a visual divider to tell them apart - stacked (collapsed)
   * they're already on separate lines, so no divider there.
   */
  protected readonly showVersionSeparator = computed(
    () => this.expanded() && !!this.frontVersion() && !!this.apiVersion(),
  );
}
