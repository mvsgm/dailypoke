# DailyPoke

Um jogo de batalhas Pokémon para o navegador, com interface em português,
desafio diário e treino livre. Projeto pessoal de Marcos Guerra.

## Como jogar

- **Desafio diário:** seis Pokémon sorteados de uma seleção de 38 espécies das
  gerações I–III. A mesma data local gera a mesma equipe e o mesmo estado inicial
  da batalha para todos. Uma tentativa por dia; o adversário é Red.
- **Modo livre:** equipes novas e partidas ilimitadas, sem alterar o histórico
  do desafio diário.
- Toque em um Pokémon antes de começar para consultar seus golpes, habilidade
  e item. Na batalha, escolha um golpe ou outro Pokémon da equipe. Os números
  **1–4** do teclado também selecionam golpes.
- Recarregar ou sair de uma batalha diária iniciada registra uma derrota.
  O próximo desafio chega à meia-noite do calendário local do jogador.

## Executar no Mac ou em outro computador

Use **Node.js 20 ou superior** para instalar e gerar os arquivos do jogo:

```sh
npm ci
npm run build
```

Depois, com Python 3, sirva a pasta `dist/`:

```sh
python3 -m http.server 8080 --directory dist
```

Abra `http://localhost:8080`. É necessário usar um servidor HTTP; abrir
`index.html` diretamente com `file://` não carrega os módulos JavaScript.

Para modificar o motor, use **Node.js 20 ou superior**:

```sh
npm ci
npm test
npm run build
```

O build atualiza somente `dist/engine.js`; preserva a interface e os sprites
locais. Não é necessário ROM, BIOS, banco de dados, conta ou servidor de jogo.

## Publicar no GitHub Pages

1. Crie um repositório e envie os arquivos deste projeto;
2. Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions**;
3. O workflow `pages.yml` executa os testes, gera o motor e publica `dist/`.

Os caminhos dos assets são relativos, portanto funcionam tanto em um domínio
próprio quanto em `usuario.github.io/nome-do-repositorio/`. Se a opção Pages não
estiver disponível para o repositório escolhido, publique a pasta `dist/` em
um serviço de hospedagem estática. O workflow inclui execução manual.

## Estrutura

```text
src/engine.js       adaptador de batalha, equipes e decisões de Red
dist/index.html    interface da arena
dist/app.js        estados da interface e controles
dist/daily.js      calendário, histórico e tentativa diária
dist/style.css     layout responsivo
dist/assets/       favicon e sprites locais
tests/             testes do motor, persistência e integração da interface
```

## Mecânicas e limites desta versão

As regras de combate vêm do simulador **Pokémon Showdown**, via
`@pkmn/sim@0.10.11`, no formato de geração III. Isso inclui PP, precisão,
velocidade, tipos, habilidades, itens, condições de status e a divisão física
ou especial por tipo. O jogo não emula uma ROM nem reproduz a interface,
animações ou áudio de FireRed. A seleção de 38 espécies usa conjuntos de golpes
preparados para evitar equipes sem opções úteis. Todos estão no nível 100.

Red usa Pikachu, Espeon, Snorlax, Venusaur, Charizard e Blastoise. A inteligência
do adversário avalia dano provável e algumas situações de status/recuperação;
ela é heurística e não calcula todas as estratégias possíveis.

O histórico fica no `localStorage` deste navegador, limitado aos últimos 90
resultados, com totais acumulados preservados. Não há login, sincronização,
ranking ou verificação remota da tentativa diária. Trocar navegador, limpar
dados ou editar o armazenamento pode mudar o histórico. O modo livre permanece
disponível mesmo quando o navegador bloqueia o armazenamento. Esta primeira
versão não inclui salvamento de uma batalha em andamento.

## Créditos

O DailyPoke é um projeto pessoal de Marcos Guerra. A interface, o adaptador
e o controle diário foram desenvolvidos para este projeto.

- Motor: [Pokémon Showdown / pkmn](https://github.com/pkmn/ps), licença MIT;
- Sprites de geração III: [PokeAPI/sprites](https://github.com/PokeAPI/sprites);
- Pokémon, nomes, personagens e imagens pertencem aos respectivos titulares,
  incluindo Nintendo, Creatures e GAME FREAK. Projeto de fã independente,
  sem afiliação ou endosso.

Veja `dist/THIRD_PARTY_LICENSES.txt` para os avisos dos componentes distribuídos.
O código original está sob a licença MIT em `LICENSE`; essa licença não concede
direitos sobre os personagens, marcas ou sprites de terceiros.
