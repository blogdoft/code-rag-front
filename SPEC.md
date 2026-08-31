# CODE-RAG-FRONT

Esse sistema deve oferecer uma UI e UX amigável para o usuário da api https://code-rag-api.home.arpa.

O usuário deve ser capaz de selecionar um projeto e fazer perguntas. Toda vez que ele clicar em uma das respostas oferecidas pelo retorno da api, ele deve ser capaz de visualizar o conteúdo em um pop-up.
Atenção especial ao campo embeddingText, que é um multi-line com quebras de linha embutidos.

Fique especialmente atento com o conteúdo enviado e o conteúdo lido da api. Você deve evitar cross site scripting.

A aplicação deve ser escrita em angular, utilizando a versão mais recente de todas as bibliotecas.
Utilize as boas práticas de programação, como SOLID, Clean Code, DRY, YAGNI. 
O código precisa ser objetivo e claro, fácil de ler por usuários humanos e com um fluxo óbvio de execução.
Crie módulos para separar responsabilidades. E componentes que sejam reutilizados.
Todos os combos lookups devem ter auto-preenchimento, permitindo ao usuário digitar parte do nome, e selecionar apenas entredas válidas.
A tecla esc, quando focada em um campo, deixa ele nulo. Se o campo já estiver nulo (ou não for editável), o esc é redirecionado para a janela/pop-up em que o componente está. Se existem alterações em curso, o sistema deve perguntar se o usuário deseja abandonar as alterações. Se não existem alterações e estamos em um pop-up, o pop-up é fechado. Se estamos na janela principais. nada acontece.
Utilize tailwind.
Para notificações em geral - seja de sucesso ou falha - utiliza toast notifications.
A aplicação deve ter tema light e dark, orientados conforme a configuração do navegador.
Não é exigido login.
Todas as configurações são armazenadas no local storage.
O usuário deve ter uma tela em que ele configura a base-url da api em que serão executadas as pesquisas. Esta tela está acessível através de uma opção de menu.
Não deve haver validação de certificado nas chamadas.

A definição da api está em openapi.generated.json