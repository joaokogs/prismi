# Política de Privacidade — Prismi Dashboard

Última atualização: 24 de outubro de 2026

Esta política descreve como o Prismi Dashboard coleta, usa e compartilha informações dos usuários.

## Armazenamento de dados

O Prismi Dashboard não usa dados para rastreamento ou publicidade. Os dados criados pelo usuário ficam no dispositivo.

Todos os dados criados pelo usuário (workspaces, widgets, links, notas, eventos, configurações de tema e wallpapers) são armazenados exclusivamente no armazenamento local do navegador (`browser.storage.local`) e nunca são enviados para servidores do Prismi. Alguns recursos opcionais, como clima e feriados, consultam APIs públicas quando utilizados.

## APIs de terceiros utilizadas

A extensão faz requisições de rede às seguintes APIs exclusivamente para funcionalidades solicitadas pelo usuário:

| Serviço | Dados enviados | Finalidade |
|---|---|---|
| **Google Favicons** (`www.google.com/s2/favicons`) | Domínio do link salvo pelo usuário | Exibir o favicon do site ao lado do link |
| **Open-Meteo** (`api.open-meteo.com`) | Coordenadas geográficas (latitude/longitude) ou nome da cidade | Obter previsão do tempo |
| **Open-Meteo Geocoding** (`geocoding-api.open-meteo.com`) | Nome da cidade digitado pelo usuário | Converter nome de cidade em coordenadas |
| **BigDataCloud** (`api.bigdatacloud.net`) | Coordenadas geográficas (latitude/longitude) | Converter coordenadas em nome de cidade |
| **IBGE — API de Localidades** (`servicodados.ibge.gov.br`) | Nenhum dado pessoal; apenas sigla da UF consultada | Resolver o código IBGE do município e carregar a lista de cidades |
| **Feriados do Brasil** (`raw.githubusercontent.com/joaopbini/feriados-brasil`) | Nenhum dado pessoal | Obter feriados nacionais, estaduais e municipais |
| **Mecanismo de busca escolhido** (Google, Yahoo, Bing ou DuckDuckGo) | Consulta de busca digitada pelo usuário | Sugestões de autocomplete na barra de pesquisa |

### Geolocalização

Os widgets de clima e calendário **podem** solicitar acesso à localização do dispositivo (via `navigator.geolocation`) **quando o usuário clica em “Usar minha localização” ou não informa uma cidade manualmente**. Essa solicitação é opcional e o usuário pode negá-la.

No calendário, as coordenadas são usadas apenas para descobrir o município e exibir feriados locais. O app **não armazena latitude/longitude**: guarda somente cidade, UF e código IBGE. As coordenadas obtidas são enviadas apenas às APIs de clima e geocodificação listadas acima.

A cidade também pode ser escolhida manualmente, sem usar geolocalização.

## Dados coletados pela extensão

A extensão **não coleta, armazena ou transmite** dados de navegação, histórico, cookies ou os dados salvos pelo usuário. Tudo permanece no dispositivo do usuário.

## Compartilhamento com terceiros

Nenhum dado do usuário é vendido, alugado ou compartilhado com terceiros para fins comerciais.

## Créditos de dados

- Feriados brasileiros: [`joaopbini/feriados-brasil`](https://github.com/joaopbini/feriados-brasil), licença MIT.
- Municípios e unidades federativas: API de Localidades do IBGE.
- Geocodificação reversa: BigDataCloud.

## Código aberto

O código-fonte completo da extensão está disponível sob licença MIT e pode ser auditado publicamente.

## Contato

Para dúvidas sobre esta política de privacidade, abra uma issue no repositório oficial da extensão ou entre em contato pelo e-mail disponível na página do desenvolvedor no AMO.
