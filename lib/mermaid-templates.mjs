// lib/mermaid-templates.mjs — modelos iniciais para o menu "Diagrama Mermaid".
// Cada modelo tem ao menos quatro elementos do tipo escolhido, para servir de
// ponto de partida editável. Sintaxe compatível com o Mermaid 10.9.

export const MERMAID_TEMPLATES = [
  { id: 'blank', label: 'Em branco', group: 'Básico', source: '' },
  {
    id: 'flowchart', label: 'Fluxograma', group: 'Básico',
    source: `flowchart TD
  A[Início] --> B{Condição?}
  B -- Sim --> C[Processar]
  B -- Não --> D[Registrar erro]
  C --> E[Fim]
  D --> E`,
  },
  {
    id: 'flowchart-subgraphs', label: 'Fluxograma com subgráficos', group: 'Básico',
    source: `flowchart LR
  subgraph Cliente
    UI[Aplicação web]
    Cache[(Cache local)]
  end
  subgraph Serviços
    API[API gateway]
    Auth[Autenticação]
    Pedidos[Serviço de pedidos]
  end
  subgraph Armazenamento
    DB[(Banco de pedidos)]
  end
  UI --> API
  UI --> Cache
  API --> Auth
  API --> Pedidos
  Pedidos --> DB
  Auth -. token .-> UI`,
  },
  {
    id: 'sequence', label: 'Diagrama de sequência', group: 'Básico',
    source: `sequenceDiagram
  autonumber
  participant U as Usuário
  participant A as App
  participant S as Servidor
  participant B as Banco
  U->>A: Preenche formulário
  A->>S: POST /pedidos
  S->>B: INSERT pedido
  B-->>S: id gerado
  S-->>A: 201 Created
  A-->>U: Confirmação`,
  },
  {
    id: 'class', label: 'Diagrama de classes', group: 'Estrutura',
    source: `classDiagram
  class Pedido {
    +int id
    +Date data
    +total() float
  }
  class Item {
    +string produto
    +int quantidade
    +float preco
  }
  class Cliente {
    +string nome
    +string email
  }
  class Pagamento {
    +string metodo
    +confirmar()
  }
  Cliente "1" --> "*" Pedido : faz
  Pedido "1" *-- "*" Item : contém
  Pedido "1" --> "1" Pagamento : pago por`,
  },
  {
    id: 'state', label: 'Diagrama de estados', group: 'Estrutura',
    source: `stateDiagram-v2
  [*] --> Rascunho
  Rascunho --> EmRevisao : enviar
  EmRevisao --> Aprovado : aprovar
  EmRevisao --> Rascunho : devolver
  Aprovado --> Publicado : publicar
  Publicado --> [*]`,
  },
  {
    id: 'er', label: 'Entidade-relacionamento', group: 'Estrutura',
    source: `erDiagram
  CLIENTE ||--o{ PEDIDO : faz
  PEDIDO ||--|{ ITEM : contem
  PRODUTO ||--o{ ITEM : aparece_em
  PEDIDO ||--|| PAGAMENTO : liquidado_por
  CLIENTE {
    int id PK
    string nome
    string email
  }
  PEDIDO {
    int id PK
    date data
    float total
  }`,
  },
  {
    id: 'gantt', label: 'Gantt', group: 'Planejamento',
    source: `gantt
  title Cronograma do projeto
  dateFormat YYYY-MM-DD
  section Descoberta
    Levantamento      :a1, 2026-01-05, 10d
    Proposta          :a2, after a1, 5d
  section Construção
    Desenvolvimento   :b1, after a2, 30d
    Testes            :b2, after b1, 10d
  section Entrega
    Homologação       :c1, after b2, 7d
    Lançamento        :milestone, after c1, 0d`,
  },
  {
    id: 'timeline', label: 'Linha do tempo', group: 'Planejamento',
    source: `timeline
  title Evolução do produto
  2023 : Ideia : Protótipo
  2024 : Primeira versão : Primeiros clientes
  2025 : Versão 2.0 : Expansão
  2026 : Integrações : Nova plataforma`,
  },
  {
    id: 'journey', label: 'Jornada do usuário', group: 'Planejamento',
    source: `journey
  title Compra no site
  section Descoberta
    Encontra o produto: 4: Cliente
    Compara preços: 3: Cliente
  section Compra
    Adiciona ao carrinho: 5: Cliente
    Paga: 3: Cliente, Sistema
  section Pós-venda
    Recebe o pedido: 5: Cliente
    Avalia: 4: Cliente`,
  },
  {
    id: 'pie', label: 'Pizza', group: 'Dados',
    source: `pie showData
  title Distribuição de uso
  "Desktop" : 45
  "Celular" : 35
  "Tablet" : 12
  "Outros" : 8`,
  },
  {
    id: 'xychart', label: 'Gráfico XY (barras e linha)', group: 'Dados',
    source: `xychart-beta
  title "Receita mensal"
  x-axis [jan, fev, mar, abr, mai, jun]
  y-axis "Receita (mil)" 0 --> 120
  bar [40, 55, 62, 70, 85, 110]
  line [45, 50, 65, 72, 80, 105]`,
  },
  {
    id: 'quadrant', label: 'Quadrantes', group: 'Dados',
    // O lexer deste diagrama não aceita acentos nos rótulos.
    source: `quadrantChart
  title Priorizacao de iniciativas
  x-axis Baixo esforco --> Alto esforco
  y-axis Baixo impacto --> Alto impacto
  quadrant-1 Planejar
  quadrant-2 Fazer agora
  quadrant-3 Evitar
  quadrant-4 Delegar
  Busca: [0.3, 0.8]
  Tema escuro: [0.2, 0.4]
  Sincronizacao: [0.8, 0.9]
  Plugins: [0.7, 0.3]`,
  },
  {
    id: 'sankey', label: 'Sankey (fluxos)', group: 'Dados',
    // Formato CSV; o lexer não aceita acentos.
    source: `sankey-beta

Orcamento,Engenharia,50
Orcamento,Marketing,25
Orcamento,Operacoes,25
Engenharia,Produto,30
Engenharia,Infraestrutura,20
Marketing,Campanhas,25`,
  },
  {
    id: 'mindmap', label: 'Mapa mental', group: 'Ideias',
    source: `mindmap
  root((kMdedit))
    Edição
      WYSIWYG
      Código
    Diagramas
      Mermaid
      Modelos
    Arquivos
      Abas
      Recentes`,
  },
  {
    id: 'gitgraph', label: 'Grafo de commits (git)', group: 'Engenharia',
    source: `gitGraph
  commit id: "inicial"
  branch feature
  checkout feature
  commit id: "busca"
  commit id: "ícones"
  checkout main
  commit id: "correções"
  merge feature id: "release"`,
  },
  {
    id: 'c4', label: 'Contexto C4', group: 'Engenharia',
    source: `C4Context
  title Contexto do sistema
  Person(usuario, "Usuário", "Edita documentos")
  System(kmdedit, "kMdedit", "Editor de Markdown")
  System_Ext(git, "Repositório git", "Versionamento")
  System_Ext(fs, "Sistema de arquivos", "Arquivos .md")
  Rel(usuario, kmdedit, "Usa")
  Rel(kmdedit, fs, "Lê e grava")
  Rel(usuario, git, "Publica")`,
  },
  {
    id: 'requirement', label: 'Requisitos', group: 'Engenharia',
    source: `requirementDiagram
  requirement salvar_atomico {
    id: 1
    text: Gravação nunca deixa arquivo pela metade
    risk: high
    verifymethod: test
  }
  requirement busca {
    id: 2
    text: Localizar texto nos três modos
    risk: medium
    verifymethod: demonstration
  }
  element backend {
    type: módulo
  }
  element ui {
    type: módulo
  }
  backend - satisfies -> salvar_atomico
  ui - satisfies -> busca`,
  },
  {
    id: 'block', label: 'Diagrama de blocos', group: 'Engenharia',
    source: `block-beta
  columns 3
  Entrada:1 Processo:1 Saida["Saída"]:1
  space Fila[("Fila")] space
  Entrada --> Processo
  Processo --> Saida
  Processo --> Fila`,
  },
];

/** Modelos agrupados por categoria, na ordem em que aparecem. */
export function templateGroups(list = MERMAID_TEMPLATES) {
  const groups = [];
  for (const t of list) {
    let g = groups.find((x) => x.group === t.group);
    if (!g) { g = { group: t.group, items: [] }; groups.push(g); }
    g.items.push(t);
  }
  return groups;
}

export function findTemplate(id, list = MERMAID_TEMPLATES) {
  return list.find((t) => t.id === id) ?? null;
}
