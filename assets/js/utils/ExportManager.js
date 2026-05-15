// assets/js/utils/ExportManager.js
// Fachada unificada para exportação de documentos.
// DocumentEditor.js importa este módulo e chama toPDF() / toWord().
// Delega o trabalho para PDFExporter e WordExporter existentes em /components/.

import { pdfExporter }  from '../components/PDFExporter.js';
import { wordExporter } from '../components/WordExporter.js';

class ExportManager {

    /**
     * Exporta para PDF.
     * @param {string} content   - Conteúdo Markdown do documento
     * @param {string} filename  - Nome base do ficheiro (sem extensão)
     * @param {object} metadata  - { type, user, ... } — passado ao PDFExporter
     */
    async toPDF(content, filename = 'Documento', metadata = {}) {
        const meta = this._buildMeta(metadata);
        return pdfExporter.export(content, `${filename}.pdf`, meta);
    }

    /**
     * Exporta para Word (.docx).
     * @param {string} content   - Conteúdo Markdown do documento
     * @param {string} filename  - Nome base do ficheiro (sem extensão)
     * @param {object} metadata  - { type, user, ... } — passado ao WordExporter
     */
    async toWord(content, filename = 'Documento', metadata = {}) {
        const meta = this._buildMeta(metadata);
        return wordExporter.export(content, `${filename}.docx`, meta);
    }

    // Normaliza metadata: mapeia { type } → { docType } que os exporters esperam
    _buildMeta(metadata = {}) {
        return {
            docType: metadata.type || metadata.docType || 'generic',
            title:   metadata.title  || 'Documento',
            cidade:  metadata.cidade || 'Maputo',
            ano:     metadata.ano    || new Date().getFullYear(),
            // repassa todos os outros campos (aluno, docente, etc.)
            ...metadata,
        };
    }
}

export const exportManager = new ExportManager();
export default ExportManager;
