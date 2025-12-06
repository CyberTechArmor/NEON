import { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Upload,
  FileSpreadsheet,
  Download,
  Loader2,
  Check,
  X,
  AlertTriangle,
  FileText,
  Users,
  HelpCircle,
} from 'lucide-react';
import { adminApi, getErrorMessage } from '../../lib/api';

// Import result type
interface ImportResult {
  imported: number;
  failed: number;
  errors: string[];
}

// CSV Template content
const CSV_TEMPLATE = `email,name,role,department
john.doe@company.com,John Doe,Member,Engineering
jane.smith@company.com,Jane Smith,Manager,Marketing
bob.wilson@company.com,Bob Wilson,Admin,`;

// Main component
export default function BulkImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<string[][] | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Fetch roles and departments for reference
  const { data: rolesData } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const response = await adminApi.roles.list();
      return response.data.data;
    },
  });

  const { data: departmentsData } = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: async () => {
      const response = await adminApi.departments.list();
      return response.data.data;
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (file: File) => adminApi.users.bulkImport(file),
    onSuccess: (response) => {
      const result = (response.data as any).data as ImportResult;
      setImportResult(result);
      if (result.imported > 0 && result.failed === 0) {
        toast.success(`Successfully imported ${result.imported} users`);
      } else if (result.imported > 0) {
        toast.success(`Imported ${result.imported} users, ${result.failed} failed`);
      } else {
        toast.error('Import failed - no users were imported');
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }

    setSelectedFile(file);
    setImportResult(null);

    // Parse CSV for preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter((line) => line.trim());
      const data = lines.map((line) => {
        // Simple CSV parsing (handles basic cases)
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      });
      setPreviewData(data.slice(0, 6)); // Show first 5 rows + header
    };
    reader.readAsText(file);
  }, []);

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  // Download template
  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'neon-user-import-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Start import
  const handleImport = () => {
    if (!selectedFile) return;
    importMutation.mutate(selectedFile);
  };

  // Reset
  const handleReset = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Bulk Import</h2>
          <p className="text-neon-text-muted">
            Import multiple users at once using a CSV file
          </p>
        </div>
        <button className="btn btn-secondary" onClick={downloadTemplate}>
          <Download className="w-4 h-4" />
          <span>Download Template</span>
        </button>
      </div>

      {/* Instructions */}
      <div className="card p-4 mb-6">
        <div className="flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-neon-text-muted mt-0.5" />
          <div>
            <p className="font-medium mb-2">CSV Format Requirements</p>
            <ul className="text-sm text-neon-text-muted space-y-1">
              <li>• The first row must contain column headers: <code className="px-1 bg-neon-surface rounded">email,name,role,department</code></li>
              <li>• <strong>email</strong> (required): User's email address</li>
              <li>• <strong>name</strong> (required): User's display name</li>
              <li>• <strong>role</strong> (required): Role name (must match existing role)</li>
              <li>• <strong>department</strong> (optional): Department name</li>
              <li>• A random password will be generated and emailed to each user</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Available roles and departments */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Available Roles
          </h3>
          <div className="flex flex-wrap gap-2">
            {rolesData?.map((role: any) => (
              <span key={role.id} className="badge">{role.name}</span>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Available Departments
          </h3>
          <div className="flex flex-wrap gap-2">
            {departmentsData?.map((dept: any) => (
              <span key={dept.id} className="badge">{dept.name}</span>
            ))}
            {(!departmentsData || departmentsData.length === 0) && (
              <span className="text-sm text-neon-text-muted">No departments created</span>
            )}
          </div>
        </div>
      </div>

      {/* File upload area */}
      {!selectedFile ? (
        <div
          className={`card border-2 border-dashed p-12 text-center transition-colors ${
            dragActive ? 'border-white bg-neon-surface-hover' : 'border-neon-border'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-neon-text-muted" />
          <h3 className="text-lg font-medium mb-2">Drop your CSV file here</h3>
          <p className="text-neon-text-muted mb-4">or click to browse</p>
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" />
            <span>Select CSV File</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Selected file info */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-neon-text-muted" />
                <div>
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-neon-text-muted">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                    {previewData && ` • ${previewData.length - 1} users`}
                  </p>
                </div>
              </div>
              <button className="btn btn-ghost" onClick={handleReset}>
                <X className="w-4 h-4" />
                <span>Remove</span>
              </button>
            </div>
          </div>

          {/* Preview table */}
          {previewData && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-neon-border bg-neon-surface-hover">
                <h3 className="font-medium">Preview</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-neon-surface">
                    <tr>
                      {previewData[0]?.map((header, i) => (
                        <th key={i} className="px-4 py-2 text-left text-sm font-medium text-neon-text-secondary">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neon-border">
                    {previewData.slice(1).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-4 py-2 text-sm">
                            {cell || <span className="text-neon-text-muted">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.length > 6 && (
                <div className="px-4 py-2 text-sm text-neon-text-muted border-t border-neon-border">
                  ... and {previewData.length - 6} more rows
                </div>
              )}
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className={`card p-4 ${importResult.failed > 0 ? 'border-neon-warning' : 'border-neon-success'}`}>
              <div className="flex items-start gap-3">
                {importResult.failed === 0 ? (
                  <Check className="w-5 h-5 text-neon-success" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-neon-warning" />
                )}
                <div className="flex-1">
                  <p className="font-medium">
                    {importResult.imported > 0
                      ? `${importResult.imported} users imported successfully`
                      : 'No users were imported'}
                  </p>
                  {importResult.failed > 0 && (
                    <p className="text-sm text-neon-warning mt-1">
                      {importResult.failed} users failed to import
                    </p>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium mb-1">Errors:</p>
                      <ul className="text-sm text-neon-text-muted space-y-1 max-h-40 overflow-y-auto">
                        {importResult.errors.map((error, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <X className="w-4 h-4 text-neon-error flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-3">
            <button className="btn btn-ghost" onClick={handleReset}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Import Users</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
