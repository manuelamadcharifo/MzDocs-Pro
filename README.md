# MzDocs Pro – PWA 📄🇲🇿

**Serviços digitais que substituem papelarias em Moçambique.**

---

## 📦 Ficheiros incluídos

```
MzDocs-Pro/
├── index.html      ← Aplicação principal (toda a lógica)
├── manifest.json   ← Configuração PWA (instalável no celular)
├── sw.js           ← Service Worker (offline support)
├── icon.svg        ← Ícone da aplicação
└── README.md       ← Este ficheiro
```

---

## ⚙️ Configuração obrigatória

Abra `index.html` e altere o número de WhatsApp:

```javascript
// Linha ~180
const WHATSAPP_NUMBER = '258840000000'; // ← SEU NÚMERO AQUI
// Exemplo: '258841234567' (sem + e sem espaços)
```

---

## 🚀 Publicar no GitHub Pages (grátis)

1. Crie uma conta em [github.com](https://github.com)
2. Crie um repositório público chamado `mzdocs-pro`
3. Faça upload de todos os ficheiros
4. Vá em **Settings → Pages → Source → main branch**
5. O seu site ficará em: `https://SEU_USUARIO.github.io/mzdocs-pro`

---

## 🚀 Publicar no Netlify (grátis, mais fácil)

1. Acesse [netlify.com](https://netlify.com)
2. Clique em **"Add new site" → "Deploy manually"**
3. Arraste a pasta `MzDocs-Pro` para a área indicada
4. Pronto! Receberá um link tipo: `https://mzdocs-pro.netlify.app`

---

## 📱 Instalar no celular (Android)

1. Abra o link da aplicação no **Google Chrome**
2. Um banner aparecerá: **"Adicionar ao ecrã inicial"**
3. Confirme → A app fica instalada como aplicação nativa!

---

## 🎨 Personalização

### Alterar número de WhatsApp
```javascript
const WHATSAPP_NUMBER = '258840000000';
```

### Alterar nome da empresa
Pesquise por `MzDocs Pro` no `index.html` e substitua.

### Adicionar/remover serviços
Cada serviço está definido no objecto `services` no JavaScript.

---

## 📋 Serviços disponíveis

| Serviço | Campos |
|---------|--------|
| 📚 Trabalhos Escolares | Nome, Tema, Nível, Prazo, Descrição |
| 📋 Currículo (CV) | Nome, Idade, Formação, Experiência, Habilidades, Modelo |
| ✉️ Cartas Formais | Tipo, Nome, Destinatário, Conteúdo, Formato |
| 🖨️ Impressão | Nome, Tipo, Páginas, Cópias, Papel, Obs |
| 📷 Foto p/ Documentos | Nome, Finalidade, Quantidade, Fundo |
| 🔄 Conversão de Arquivos | Nome, Tipo de conversão, Urgência |
| 🏗️ Orçamento de Construção | Nome, Tipo de obra, Área, Localização, Fase, Budget |

---

## 💡 Dicas de marketing

- Partilhe o link da app no **WhatsApp Status**
- Crie um **QR Code** do link (use qr-code-generator.com)
- Imprima o QR Code e coloque em locais estratégicos (escolas, mercados)
- Publique no **Facebook** e **TikTok** mostrando como funciona

---

*MzDocs Pro © 2024 – Feito com ❤️ para Moçambique*
