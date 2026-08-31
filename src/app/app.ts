import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { PopupCoordinatorService } from './core/services/popup-coordinator.service';
import { ThemeService } from './core/services/theme.service';
import { VersionService } from './core/services/version.service';
import { ToastContainer } from './shared/components/toast/toast-container';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ToastContainer],
  templateUrl: './app.html',
})
export class App implements OnInit {
  private readonly theme = inject(ThemeService);
  private readonly popupCoordinator = inject(PopupCoordinatorService);
  private readonly versionService = inject(VersionService);

  protected readonly version = signal('');

  ngOnInit(): void {
    this.theme.init();
    this.versionService.get().subscribe((version) => this.version.set(version));
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.popupCoordinator.handleEscape();
  }
}
