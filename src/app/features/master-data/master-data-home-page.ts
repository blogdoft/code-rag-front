import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface MasterDataCard {
  label: string;
  path: string;
  description: string;
}

/** Landing page of the master-data section: one card per catalog that has its own CRUD screen. */
@Component({
  selector: 'app-master-data-home-page',
  imports: [RouterLink],
  templateUrl: './master-data-home-page.html',
})
export class MasterDataHomePage {
  protected readonly cards: readonly MasterDataCard[] = [
    {
      label: 'Document types',
      path: '/document-types',
      description: 'Categories used to classify documents, such as manuals or standards.',
    },
    {
      label: 'Document languages',
      path: '/document-languages',
      description: 'BCP 47 language codes a document can be written in, such as pt-BR.',
    },
  ];
}
