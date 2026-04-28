// assets/js/components/WordExporter.js
// Exportador dedicado para Word (.doc)

export class WordExporter {
    export(markdownContent, filename, metadata = {}) {
        try {
            const html = this._markdownToHTML(markdownContent, metadata);
            const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename || `mzdocs-${Date.now()}.doc`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return { success: true, fileName: a.download };
        } catch (err) {
            console.error('[WordExporter] Erro:', err);
            throw new Error('Falha ao gerar Word: ' + err.message);
        }
    }

    _markdownToHTML(md, metadata = {}) {
        let html = md;

        // Headers
        html = html.replace(/^######\s+(.+)$/gm, '<h6 style="font-size:11px;color:#334155;margin:8px 0;">$1</h6>');
        html = html.replace(/^#####\s+(.+)$/gm, '<h5 style="font-size:12px;color:#334155;margin:10px 0;">$1</h5>');
        html = html.replace(/^####\s+(.+)$/gm, '<h4 style="font-size:13px;color:#1e293b;margin:10px 0;">$1</h4>');
        html = html.replace(/^###\s+(.+)$/gm, '<h3 style="font-size:14px;color:#1e293b;margin:12px 0;">$1</h3>');
        html = html.replace(/^##\s+(.+)$/gm, '<h2 style="font-size:16px;color:#0f172a;margin:14px 0;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">$1</h2>');
        html = html.replace(/^#\s+(.+)$/gm, '<h1 style="font-size:20px;color:#07101f;margin:16px 0;border-bottom:2px solid #3b82f6;padding-bottom:6px;">$1</h1>');

        // Bold e italic
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // Inline code
        html = html.replace(/`(.+?)`/g, '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:13px;">$1</code>');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#3b82f6;text-decoration:underline;">$1</a>');

        // Listas
        html = html.replace(/^(\s*)[-*]\s+(.+)$/gm, (match, indent, text) => {
            const level = Math.floor(indent.length / 2);
            const padding = 20 + level * 15;
            return `<div style="margin:4px 0;padding-left:${padding}px;position:relative;"><span style="position:absolute;left:${padding - 15}px;">•</span>${text}</div>`;
        });

        // Listas numeradas
        let olCounter = 0;
        html = html.replace(/^(\s*)\d+\.\s+(.+)$/gm, (match, indent, text) => {
            olCounter++;
            const level = Math.floor(indent.length / 2);
            const padding = 20 + level * 15;
            return `<div style="margin:4px 0;padding-left:${padding}px;position:relative;"><span style="position:absolute;left:${padding - 20}px;font-weight:bold;">${olCounter}.</span>${text}</div>`;
        });

        // Tabelas
        html = html.replace(/(\|[^\n]+\|\n\|[-:\|\s]+\|\n(?:\|[^\n]+\|\n?)+)/g, (match) => {
            const rows = match.trim().split('\n').filter(r => r.includes('|'));
            if (rows.length < 2) return match;

            let tableHtml = '<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;">';
            rows.forEach((row, i) => {
                const cells = row.split('|').filter(c => c.trim() !== '');
                const tag = i === 0 ? 'th' : 'td';
                const bg = i === 0 ? 'background:#f8fafd;' : '';
                const border = 'border:1px solid #e2e8f0;padding:8px 12px;';

                tableHtml += '<tr>';
                cells.forEach(cell => {
                    tableHtml += `<${tag} style="${border}${bg}">${cell.trim()}</${tag}>`;
                });
                tableHtml += '</tr>';
            });
            tableHtml += '</table>';
            return tableHtml;
        });

        // Separadores horizontais
        html = html.replace(/^\s*[-=]{3,}\s*$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">');

        // Parágrafos
        const paragraphs = html.split(/\n\n+/).map(p => {
            p = p.trim();
            if (!p) return '';
            if (p.startsWith('<')) return p;
            return `<p style="margin:8px 0;line-height:1.6;color:#334155;">${p.replace(/\n/g, '<br>')}</p>`;
        }).filter(Boolean);

        const title = metadata.title ? `<div style="text-align:center;margin-bottom:20px;"><h1 style="color:#07101f;font-size:22px;">${metadata.title}</h1><p style="color:#64748b;">Gerado por MzDocs Pro • ${new Date().toLocaleDateString('pt-MZ')}</p></div>` : '';

        return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${metadata.title || 'MzDocs Pro'}</title></head>
<body style="font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#334155;padding:40px;">
${title}
${paragraphs.join('\n')}
<div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;text-align:center;">
MzDocs Pro © ${new Date().getFullYear()} • Documento gerado automaticamente
</div>
</body></html>`;
    }
}

export const wordExporter = new WordExporter();
export default WordExporter;