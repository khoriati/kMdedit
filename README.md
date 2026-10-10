# mdedit

Editor de Markdown para desktop (macOS, Windows e Linux) construído com
[Tauri 2](https://tauri.app). A proposta é a mesma do Typora: um único painel
que alterna entre **WYSIWYG**, **Código** e **Visualizar**, com diagramas
[Mermaid](https://mermaid.js.org) renderizados no lugar.

## Recursos

- Três modos por aba: WYSIWYG (digitação estilo Typora: `# `, `- `, `- [ ] `,
  `> `, ` ``` `, `**negrito**`, `` `código` ``...), Código (textarea) e
  Visualizar. Dentro de um bloco de código o Enter quebra linha; Cmd/Ctrl+Enter
  (ou Enter após uma linha vazia) sai do bloco.
- Busca (Cmd/Ctrl+F) nos três modos, com contagem e navegação entre ocorrências.
- Barra de ferramentas com ícones e dicas; listas de tarefas clicáveis.
- Abas, arquivos recentes (até 20), zoom e temas claro/escuro/alto contraste.
- Diagramas Mermaid em blocos ```` ```mermaid ````. Um diagrama inválido vira um
  cartão de erro com a fonte; o restante do documento e os outros diagramas
  continuam normais, e nada vaza para fora do editor.
- **Arrastar e soltar**: qualquer arquivo de texto (`.md`, `.txt`, `.json`,
  `.csv`, arquivos sem extensão...) solto sobre a janela abre em uma aba.
  Markdown abre em WYSIWYG; outros textos abrem em Código. Binários são
  recusados com aviso.
- Gravação atômica (temp + rename), normalização de quebras de linha e
  confirmação ao fechar aba ou janela com alterações pendentes.
- Sanitização do HTML renderizado (DOMPurify) e CSP restritiva.

## Atalhos

| Ação | Atalho |
| --- | --- |
| Nova aba | Cmd/Ctrl+N ou Cmd/Ctrl+T |
| Abrir | Cmd/Ctrl+O |
| Salvar / Salvar como | Cmd/Ctrl+S / Cmd/Ctrl+Shift+S |
| Fechar aba | Cmd/Ctrl+W |
| Localizar / próxima ocorrência | Cmd/Ctrl+F / Enter (Shift+Enter volta) |
| Alternar modo (WYSIWYG → Código → Visualizar) | Cmd/Ctrl+Shift+R |
| Próxima / aba anterior | Ctrl+Tab / Ctrl+Shift+Tab |
| Zoom | Cmd/Ctrl+= , Cmd/Ctrl+- , Cmd/Ctrl+0 |
| Títulos 1 a 6 (WYSIWYG) | Cmd/Ctrl+1 … 6 |
| Negrito / itálico / código / link | Cmd/Ctrl+B / I / E / K |
| Lista / numerada / tarefas / citação | Cmd/Ctrl+Alt+U / O / X / Q |
| Bloco de código / Mermaid / linha horizontal | Cmd/Ctrl+Alt+C / M / − |
| Sair do bloco de código | Cmd/Ctrl+Enter |

## Desenvolvimento

Pré-requisitos: Node 20+, Rust estável e as dependências do Tauri para a sua
plataforma (veja <https://tauri.app/start/prerequisites/>).

```bash
npm install
npm run dev        # compila o bundle da UI e abre o app em modo dev
npm run build      # gera os instaladores em src-tauri/target/release/bundle
npm test           # testes da lógica JS (node:test + jsdom)
npm run test:rust  # testes do backend Rust
```

## Estrutura

```
lib/        lógica pura e testável (render, mermaid, conversão, abas, regras)
ui/         index.html, style.css e app.js (bundle gerado em ui/dist)
src-tauri/  backend Rust: leitura/escrita de texto, menu nativo, permissões
test/       suíte node:test
```

### Como a renderização falha com segurança

`lib/mermaid.mjs` valida cada diagrama com `mermaid.parse` antes de desenhar,
desenha dentro de um container isolado fora da tela, aplica timeout e limpa
qualquer elemento temporário que o Mermaid deixe no documento. `lib/render.mjs`
troca uma falha do parser de Markdown por um bloco de aviso com a fonte. Em
`ui/app.js`, renderizações têm número de geração (uma troca de aba abandona a
anterior) e erros não tratados vão para a barra de status em vez de derrubar a
interface.

## Licença

MIT. Veja [LICENSE](LICENSE).
