// assets/js/utils/ImageResize.js
// Redimensiona/comprime uma imagem no browser, via <canvas>, antes de a
// embutir num documento (logo, etc.) — extraído de
// DocumentEditor.js#_resizeLogoImage (Set/2026) para ser reaproveitado
// também pelo campo "Logotipo (opcional)" nos formulários (Views.js),
// que corre ANTES de o DocumentEditor sequer existir.
//
// SEGURANÇA: isto não é só uma optimização de tamanho — é a única barreira
// de segurança necessária para aceitar imagens de um utilizador:
//   1. Nunca sai do browser. Não há upload para nenhum servidor, nem
//      escrita em disco no back-end — elimina por completo a superfície de
//      ataque do lado do servidor (sem path traversal, sem execução de
//      ficheiro, sem armazenamento a gerir/expor).
//   2. `new Image()` só chama onload() se o browser conseguir DECODIFICAR
//      o ficheiro como imagem real — um ficheiro malicioso disfarçado de
//      .png (mas que não é uma imagem válida) cai sempre em onerror() e
//      é rejeitado, sem nunca chegar a tocar no resto da aplicação.
//   3. O resultado de canvas.toDataURL() é sempre um PNG/JPEG gerado de
//      raiz a partir dos PÍXEIS decodificados — nunca os bytes originais
//      do ficheiro. Isto elimina qualquer conteúdo escondido no ficheiro
//      original (metadados EXIF, polyglots tipo GIFAR, scripts embutidos
//      em SVG) — mesmo que a origem fosse maliciosa, só os píxeis
//      sobrevivem à reencodificação.
//   4. O <img> que mostra a imagem (nunca <object>/<iframe>) não executa
//      scripts mesmo para um SVG malicioso — mas ainda assim o ficheiro
//      de entrada nunca é aceite como SVG aqui (ver accept="image/*" nos
//      pontos de chamada, que na prática cobre png/jpeg/webp/gif no
//      selector do telemóvel).
export function resizeImageToDataUrl(file, maxSide = 500, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('Ficheiro não é uma imagem'));
      return;
    }
    // Tecto de tamanho ANTES de sequer ler o ficheiro — evita que uma foto
    // enorme (ex: 20MB direto da câmara) trave o browser a decodificar.
    const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_INPUT_BYTES) {
      reject(new Error('Imagem demasiado grande (máx. 15MB) — escolha uma mais pequena.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha a ler o ficheiro'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Ficheiro não é uma imagem válida'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale) || 1;
        const h = Math.round(img.height * scale) || 1;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        // PNG quando a origem é PNG (preserva fundo transparente, comum em
        // logotipos) — JPEG para o resto, que comprime muito melhor fotos.
        const keepPng = /png/i.test(file.type);
        resolve(keepPng
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
