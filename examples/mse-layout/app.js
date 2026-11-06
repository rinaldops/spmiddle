/* The ready-made application knows only its container, not SharePoint layout. */
export function mount(root) {
  const document = root.ownerDocument;
  const section = document.createElement("section");
  section.className = "layout-example-app";
  const title = document.createElement("h2");
  title.textContent = "Aplicação responsiva ao container";
  const description = document.createElement("p");
  description.textContent = "A largura externa é escolhida na publicação. Este conteúdo mantém max-width: 1200px.";
  const grid = document.createElement("div");
  grid.className = "layout-example-app__grid";
  ["Consultas", "Arquivos", "Relatórios"].forEach((label) => {
    const card = document.createElement("article");
    card.textContent = label;
    grid.append(card);
  });
  section.append(title, description, grid);
  root.append(section);
  return { dispose: () => section.remove() };
}
