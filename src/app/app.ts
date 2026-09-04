import { Component, ElementRef, HostListener, OnInit, ViewChild, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ApiVersionService } from './core/services/api-version.service';
import { ConfigService } from './core/services/config.service';
import { PopupCoordinatorService } from './core/services/popup-coordinator.service';
import { ThemeService } from './core/services/theme.service';
import { VersionService } from './core/services/version.service';
import { NavSidebar } from './shared/components/nav-sidebar/nav-sidebar';
import { ToastContainer } from './shared/components/toast/toast-container';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ToastContainer, NavSidebar],
  templateUrl: './app.html',
})
export class App implements OnInit {
  private readonly theme = inject(ThemeService);
  private readonly configService = inject(ConfigService);
  private readonly popupCoordinator = inject(PopupCoordinatorService);
  private readonly versionService = inject(VersionService);
  private readonly apiVersionService = inject(ApiVersionService);

  @ViewChild('sidebarContainer', { read: ElementRef }) private sidebarContainer?: ElementRef<HTMLElement>;
  @ViewChild('menuToggle', { read: ElementRef }) private menuToggle?: ElementRef<HTMLElement>;

  private static readonly MOBILE_QUERY = '(max-width: 767px)';

  protected readonly version = signal('');
  protected readonly apiVersion = signal('');
  protected readonly sidebarExpanded = signal(true);

  ngOnInit(): void {
    this.theme.apply(this.configService.theme());
    this.versionService.get().subscribe((version) => this.version.set(version));
    this.apiVersionService.get().subscribe((version) => this.apiVersion.set(version));

    if (this.isMobileViewport()) {
      this.sidebarExpanded.set(false);
    }
  }

  protected toggleSidebar(): void {
    this.sidebarExpanded.update((expanded) => !expanded);
  }

  /** On mobile the sidebar is a full-screen overlay, so navigating should also close it. */
  protected onSidebarLinkClicked(): void {
    if (this.isMobileViewport()) {
      this.sidebarExpanded.set(false);
    }
  }

  // jsdom does not implement matchMedia by default; treat that as "not mobile" rather than throwing.
  private isMobileViewport(): boolean {
    return window.matchMedia?.(App.MOBILE_QUERY)?.matches ?? false;
  }

  /** Collapses the sidebar back to icons-only when clicking anywhere outside it (or its toggle button). */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.sidebarExpanded()) {
      return;
    }
    const target = event.target as Node | null;
    if (!target) {
      return;
    }
    if (this.sidebarContainer?.nativeElement.contains(target) || this.menuToggle?.nativeElement.contains(target)) {
      return;
    }
    this.sidebarExpanded.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.popupCoordinator.handleEscape();
  }
}
