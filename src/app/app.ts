import { Component, HostListener, OnInit, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { PopupCoordinatorService } from './core/services/popup-coordinator.service';
import { ThemeService } from './core/services/theme.service';
import { ToastContainer } from './shared/components/toast/toast-container';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ToastContainer],
  templateUrl: './app.html',
})
export class App implements OnInit {
  private readonly theme = inject(ThemeService);
  private readonly popupCoordinator = inject(PopupCoordinatorService);

  ngOnInit(): void {
    this.theme.init();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.popupCoordinator.handleEscape();
  }
}
