import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Key,
  Globe,
  Server,
  FileKey,
  Shield,
  Loader2,
  X,
  Check,
  AlertTriangle,
  Play,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { adminApi, getErrorMessage } from '../../lib/api';

// Types
interface SSOProvider {
  id: string;
  type: 'ldap' | 'oauth2' | 'saml' | 'oidc';
  name: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

type SSOType = 'ldap' | 'oauth2' | 'saml' | 'oidc';

// SSO type information
const SSO_TYPES: Record<SSOType, { label: string; icon: typeof Key; description: string }> = {
  ldap: {
    label: 'LDAP / Active Directory',
    icon: Server,
    description: 'Connect to LDAP or Active Directory for user authentication',
  },
  oauth2: {
    label: 'OAuth 2.0',
    icon: Key,
    description: 'Generic OAuth 2.0 provider (Google, GitHub, etc.)',
  },
  saml: {
    label: 'SAML 2.0',
    icon: FileKey,
    description: 'Enterprise SAML identity provider (Okta, OneLogin, etc.)',
  },
  oidc: {
    label: 'OpenID Connect',
    icon: Globe,
    description: 'OpenID Connect provider (Azure AD, Auth0, etc.)',
  },
};

// Form schemas for each SSO type
const ldapSchema = z.object({
  name: z.string().min(2),
  type: z.literal('ldap'),
  isEnabled: z.boolean(),
  config: z.object({
    url: z.string().url('Invalid LDAP URL'),
    baseDN: z.string().min(1, 'Base DN is required'),
    bindDN: z.string().min(1, 'Bind DN is required'),
    bindPassword: z.string().min(1, 'Bind password is required'),
    userFilter: z.string().default('(uid={{username}})'),
    usernameAttribute: z.string().default('uid'),
    emailAttribute: z.string().default('mail'),
    nameAttribute: z.string().default('cn'),
    tlsEnabled: z.boolean().default(true),
    tlsVerify: z.boolean().default(true),
  }),
});

const oauth2Schema = z.object({
  name: z.string().min(2),
  type: z.literal('oauth2'),
  isEnabled: z.boolean(),
  config: z.object({
    clientId: z.string().min(1, 'Client ID is required'),
    clientSecret: z.string().min(1, 'Client secret is required'),
    authorizationUrl: z.string().url('Invalid authorization URL'),
    tokenUrl: z.string().url('Invalid token URL'),
    userInfoUrl: z.string().url('Invalid user info URL'),
    scopes: z.string().default('openid profile email'),
    emailClaim: z.string().default('email'),
    nameClaim: z.string().default('name'),
  }),
});

const samlSchema = z.object({
  name: z.string().min(2),
  type: z.literal('saml'),
  isEnabled: z.boolean(),
  config: z.object({
    entityId: z.string().min(1, 'Entity ID is required'),
    ssoUrl: z.string().url('Invalid SSO URL'),
    certificate: z.string().min(1, 'Certificate is required'),
    signatureAlgorithm: z.string().default('sha256'),
    digestAlgorithm: z.string().default('sha256'),
    wantAssertionsSigned: z.boolean().default(true),
    emailAttribute: z.string().default('email'),
    nameAttribute: z.string().default('name'),
  }),
});

const oidcSchema = z.object({
  name: z.string().min(2),
  type: z.literal('oidc'),
  isEnabled: z.boolean(),
  config: z.object({
    issuer: z.string().url('Invalid issuer URL'),
    clientId: z.string().min(1, 'Client ID is required'),
    clientSecret: z.string().min(1, 'Client secret is required'),
    scopes: z.string().default('openid profile email'),
    discoveryEnabled: z.boolean().default(true),
  }),
});

// Combined schema
const ssoProviderSchema = z.discriminatedUnion('type', [
  ldapSchema,
  oauth2Schema,
  samlSchema,
  oidcSchema,
]);

type SSOProviderFormData = z.infer<typeof ssoProviderSchema>;

// LDAP Config Form
function LDAPConfigForm({ control, errors }: { control: any; errors: any }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-2">LDAP URL</label>
          <Controller
            name="config.url"
            control={control}
            render={({ field }) => (
              <input
                type="text"
                className={`input ${errors?.config?.url ? 'input-error' : ''}`}
                placeholder="ldaps://ldap.company.com:636"
                {...field}
              />
            )}
          />
          {errors?.config?.url && (
            <p className="mt-1 text-sm text-neon-error">{errors.config.url.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Base DN</label>
          <Controller
            name="config.baseDN"
            control={control}
            render={({ field }) => (
              <input
                type="text"
                className={`input ${errors?.config?.baseDN ? 'input-error' : ''}`}
                placeholder="dc=company,dc=com"
                {...field}
              />
            )}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">User Filter</label>
          <Controller
            name="config.userFilter"
            control={control}
            render={({ field }) => (
              <input
                type="text"
                className="input"
                placeholder="(uid={{username}})"
                {...field}
              />
            )}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Bind DN</label>
          <Controller
            name="config.bindDN"
            control={control}
            render={({ field }) => (
              <input
                type="text"
                className={`input ${errors?.config?.bindDN ? 'input-error' : ''}`}
                placeholder="cn=admin,dc=company,dc=com"
                {...field}
              />
            )}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Bind Password</label>
          <div className="relative">
            <Controller
              name="config.bindPassword"
              control={control}
              render={({ field }) => (
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={`input pr-10 ${errors?.config?.bindPassword ? 'input-error' : ''}`}
                  placeholder="••••••••"
                  {...field}
                />
              )}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-text-muted"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Username Attr</label>
          <Controller
            name="config.usernameAttribute"
            control={control}
            render={({ field }) => (
              <input type="text" className="input" placeholder="uid" {...field} />
            )}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Email Attr</label>
          <Controller
            name="config.emailAttribute"
            control={control}
            render={({ field }) => (
              <input type="text" className="input" placeholder="mail" {...field} />
            )}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Name Attr</label>
          <Controller
            name="config.nameAttribute"
            control={control}
            render={({ field }) => (
              <input type="text" className="input" placeholder="cn" {...field} />
            )}
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <Controller
            name="config.tlsEnabled"
            control={control}
            render={({ field }) => (
              <input
                type="checkbox"
                checked={field.value}
                onChange={field.onChange}
                className="w-4 h-4 rounded"
              />
            )}
          />
          <span className="text-sm">Enable TLS</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Controller
            name="config.tlsVerify"
            control={control}
            render={({ field }) => (
              <input
                type="checkbox"
                checked={field.value}
                onChange={field.onChange}
                className="w-4 h-4 rounded"
              />
            )}
          />
          <span className="text-sm">Verify TLS Certificate</span>
        </label>
      </div>
    </div>
  );
}

// OAuth2 Config Form
function OAuth2ConfigForm({ control, errors }: { control: any; errors: any }) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Client ID</label>
          <Controller
            name="config.clientId"
            control={control}
            render={({ field }) => (
              <input
                type="text"
                className={`input ${errors?.config?.clientId ? 'input-error' : ''}`}
                {...field}
              />
            )}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Client Secret</label>
          <div className="relative">
            <Controller
              name="config.clientSecret"
              control={control}
              render={({ field }) => (
                <input
                  type={showSecret ? 'text' : 'password'}
                  className={`input pr-10 ${errors?.config?.clientSecret ? 'input-error' : ''}`}
                  {...field}
                />
              )}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-text-muted"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Authorization URL</label>
        <Controller
          name="config.authorizationUrl"
          control={control}
          render={({ field }) => (
            <input
              type="text"
              className={`input ${errors?.config?.authorizationUrl ? 'input-error' : ''}`}
              placeholder="https://provider.com/oauth/authorize"
              {...field}
            />
          )}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Token URL</label>
        <Controller
          name="config.tokenUrl"
          control={control}
          render={({ field }) => (
            <input
              type="text"
              className={`input ${errors?.config?.tokenUrl ? 'input-error' : ''}`}
              placeholder="https://provider.com/oauth/token"
              {...field}
            />
          )}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">User Info URL</label>
        <Controller
          name="config.userInfoUrl"
          control={control}
          render={({ field }) => (
            <input
              type="text"
              className={`input ${errors?.config?.userInfoUrl ? 'input-error' : ''}`}
              placeholder="https://provider.com/oauth/userinfo"
              {...field}
            />
          )}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Scopes</label>
          <Controller
            name="config.scopes"
            control={control}
            render={({ field }) => (
              <input type="text" className="input" placeholder="openid profile email" {...field} />
            )}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Email Claim</label>
          <Controller
            name="config.emailClaim"
            control={control}
            render={({ field }) => (
              <input type="text" className="input" placeholder="email" {...field} />
            )}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Name Claim</label>
          <Controller
            name="config.nameClaim"
            control={control}
            render={({ field }) => (
              <input type="text" className="input" placeholder="name" {...field} />
            )}
          />
        </div>
      </div>
    </div>
  );
}

// SAML Config Form
function SAMLConfigForm({ control, errors }: { control: any; errors: any }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Entity ID (Issuer)</label>
        <Controller
          name="config.entityId"
          control={control}
          render={({ field }) => (
            <input
              type="text"
              className={`input ${errors?.config?.entityId ? 'input-error' : ''}`}
              placeholder="https://idp.company.com/saml"
              {...field}
            />
          )}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">SSO URL</label>
        <Controller
          name="config.ssoUrl"
          control={control}
          render={({ field }) => (
            <input
              type="text"
              className={`input ${errors?.config?.ssoUrl ? 'input-error' : ''}`}
              placeholder="https://idp.company.com/saml/sso"
              {...field}
            />
          )}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">X.509 Certificate</label>
        <Controller
          name="config.certificate"
          control={control}
          render={({ field }) => (
            <textarea
              className={`input font-mono text-sm resize-none ${errors?.config?.certificate ? 'input-error' : ''}`}
              rows={5}
              placeholder="-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----"
              {...field}
            />
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Signature Algorithm</label>
          <Controller
            name="config.signatureAlgorithm"
            control={control}
            render={({ field }) => (
              <select className="input" {...field}>
                <option value="sha256">SHA-256</option>
                <option value="sha384">SHA-384</option>
                <option value="sha512">SHA-512</option>
              </select>
            )}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Digest Algorithm</label>
          <Controller
            name="config.digestAlgorithm"
            control={control}
            render={({ field }) => (
              <select className="input" {...field}>
                <option value="sha256">SHA-256</option>
                <option value="sha384">SHA-384</option>
                <option value="sha512">SHA-512</option>
              </select>
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Email Attribute</label>
          <Controller
            name="config.emailAttribute"
            control={control}
            render={({ field }) => (
              <input type="text" className="input" placeholder="email" {...field} />
            )}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Name Attribute</label>
          <Controller
            name="config.nameAttribute"
            control={control}
            render={({ field }) => (
              <input type="text" className="input" placeholder="name" {...field} />
            )}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <Controller
          name="config.wantAssertionsSigned"
          control={control}
          render={({ field }) => (
            <input
              type="checkbox"
              checked={field.value}
              onChange={field.onChange}
              className="w-4 h-4 rounded"
            />
          )}
        />
        <span className="text-sm">Require signed assertions</span>
      </label>
    </div>
  );
}

// OIDC Config Form
function OIDCConfigForm({ control, errors }: { control: any; errors: any }) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Issuer URL</label>
        <Controller
          name="config.issuer"
          control={control}
          render={({ field }) => (
            <input
              type="text"
              className={`input ${errors?.config?.issuer ? 'input-error' : ''}`}
              placeholder="https://login.microsoftonline.com/tenant-id/v2.0"
              {...field}
            />
          )}
        />
        <p className="mt-1 text-xs text-neon-text-muted">
          The OIDC discovery endpoint will be automatically detected
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Client ID</label>
          <Controller
            name="config.clientId"
            control={control}
            render={({ field }) => (
              <input
                type="text"
                className={`input ${errors?.config?.clientId ? 'input-error' : ''}`}
                {...field}
              />
            )}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Client Secret</label>
          <div className="relative">
            <Controller
              name="config.clientSecret"
              control={control}
              render={({ field }) => (
                <input
                  type={showSecret ? 'text' : 'password'}
                  className={`input pr-10 ${errors?.config?.clientSecret ? 'input-error' : ''}`}
                  {...field}
                />
              )}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-text-muted"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Scopes</label>
        <Controller
          name="config.scopes"
          control={control}
          render={({ field }) => (
            <input type="text" className="input" placeholder="openid profile email" {...field} />
          )}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <Controller
          name="config.discoveryEnabled"
          control={control}
          render={({ field }) => (
            <input
              type="checkbox"
              checked={field.value}
              onChange={field.onChange}
              className="w-4 h-4 rounded"
            />
          )}
        />
        <span className="text-sm">Use OIDC Discovery</span>
      </label>
    </div>
  );
}

// SSO Provider Form Modal
function SSOProviderModal({
  provider,
  onClose,
  onSuccess,
}: {
  provider?: SSOProvider;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEditing = !!provider;
  const [selectedType, setSelectedType] = useState<SSOType>(provider?.type || 'oidc');

  const getDefaultValues = (): any => {
    if (provider) {
      return {
        name: provider.name,
        type: provider.type,
        isEnabled: provider.isEnabled,
        config: provider.config,
      };
    }
    return {
      name: '',
      type: selectedType,
      isEnabled: true,
      config: {},
    };
  };

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(ssoProviderSchema),
    defaultValues: getDefaultValues(),
  });

  const watchType = watch('type');

  const createMutation = useMutation({
    mutationFn: (data: any) => adminApi.sso.createProvider(data),
    onSuccess: () => {
      toast.success('SSO provider created');
      onSuccess();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => adminApi.sso.updateProvider(provider!.id, data),
    onSuccess: () => {
      toast.success('SSO provider updated');
      onSuccess();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const onSubmit = (data: any) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-neon-border">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Edit SSO Provider' : 'Add SSO Provider'}
          </h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Provider type selection (only for new providers) */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-medium mb-2">Provider Type</label>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(SSO_TYPES) as SSOType[]).map((type) => {
                  const typeInfo = SSO_TYPES[type];
                  const Icon = typeInfo.icon;
                  return (
                    <label
                      key={type}
                      className={`card p-3 cursor-pointer hover:border-neon-border-focus ${
                        selectedType === type ? 'border-white' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        value={type}
                        checked={selectedType === type}
                        className="hidden"
                        {...register('type', {
                          onChange: () => setSelectedType(type)
                        })}
                      />
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5" />
                        <div>
                          <p className="font-medium">{typeInfo.label}</p>
                          <p className="text-xs text-neon-text-muted">{typeInfo.description}</p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Provider name */}
          <div>
            <label className="block text-sm font-medium mb-2">Display Name</label>
            <input
              type="text"
              className={`input ${errors.name ? 'input-error' : ''}`}
              placeholder="e.g. Company LDAP"
              {...register('name')}
            />
          </div>

          {/* Enable toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded" {...register('isEnabled')} />
            <span className="text-sm">Enable this provider</span>
          </label>

          {/* Type-specific config */}
          <div className="border-t border-neon-border pt-4">
            <h3 className="font-medium mb-4">Configuration</h3>
            {watchType === 'ldap' && <LDAPConfigForm control={control} errors={errors} />}
            {watchType === 'oauth2' && <OAuth2ConfigForm control={control} errors={errors} />}
            {watchType === 'saml' && <SAMLConfigForm control={control} errors={errors} />}
            {watchType === 'oidc' && <OIDCConfigForm control={control} errors={errors} />}
          </div>
        </form>

        <div className="flex justify-end gap-3 p-4 border-t border-neon-border">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            onClick={handleSubmit(onSubmit)}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {(createMutation.isPending || updateMutation.isPending) ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              isEditing ? 'Update' : 'Create'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Main component
export default function SSOConfiguration() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<SSOProvider | undefined>();

  // Fetch providers
  const { data: providers, isLoading } = useQuery({
    queryKey: ['admin', 'sso', 'providers'],
    queryFn: async () => {
      const response = await adminApi.sso.getProviders();
      return response.data.data as SSOProvider[];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.sso.deleteProvider(id),
    onSuccess: () => {
      toast.success('Provider deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'sso', 'providers'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  // Test mutation
  const testMutation = useMutation({
    mutationFn: (id: string) => adminApi.sso.testProvider(id),
    onSuccess: (response) => {
      const result = (response.data as any).data;
      if (result.success) {
        toast.success('Connection successful');
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  // Get callback URL for display
  const callbackUrl = `${window.location.origin}/auth/callback`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">SSO Configuration</h2>
          <p className="text-neon-text-muted">
            Configure single sign-on providers for your organization
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingProvider(undefined);
            setShowModal(true);
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Add Provider</span>
        </button>
      </div>

      {/* Callback URL info */}
      <div className="card p-4 mb-6 bg-neon-surface-hover">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-neon-text-muted mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Callback URL</p>
            <p className="text-sm text-neon-text-muted mb-2">
              Use this URL when configuring your identity provider
            </p>
            <div className="flex items-center gap-2">
              <code className="px-2 py-1 bg-neon-surface rounded text-sm font-mono">{callbackUrl}</code>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  navigator.clipboard.writeText(callbackUrl);
                  toast.success('Copied to clipboard');
                }}
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Providers list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : providers?.length === 0 ? (
        <div className="card p-8 text-center">
          <Key className="w-12 h-12 mx-auto mb-4 text-neon-text-muted" />
          <h3 className="text-lg font-medium mb-2">No SSO Providers</h3>
          <p className="text-neon-text-muted mb-4">
            Add an SSO provider to enable single sign-on for your users
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingProvider(undefined);
              setShowModal(true);
            }}
          >
            <Plus className="w-4 h-4" />
            <span>Add Provider</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {providers?.map((provider) => {
            const typeInfo = SSO_TYPES[provider.type];
            const Icon = typeInfo.icon;

            return (
              <div key={provider.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-neon-surface-hover flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{provider.name}</p>
                        <span className={`badge ${provider.isEnabled ? 'badge-success' : 'badge-error'}`}>
                          {provider.isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-sm text-neon-text-muted">{typeInfo.label}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => testMutation.mutate(provider.id)}
                      disabled={testMutation.isPending}
                      title="Test connection"
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setEditingProvider(provider);
                        setShowModal(true);
                      }}
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      className="btn btn-sm btn-ghost text-neon-error"
                      onClick={() => {
                        if (confirm(`Delete SSO provider "${provider.name}"?`)) {
                          deleteMutation.mutate(provider.id);
                        }
                      }}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <SSOProviderModal
          provider={editingProvider}
          onClose={() => {
            setShowModal(false);
            setEditingProvider(undefined);
          }}
          onSuccess={() => {
            setShowModal(false);
            setEditingProvider(undefined);
            queryClient.invalidateQueries({ queryKey: ['admin', 'sso', 'providers'] });
          }}
        />
      )}
    </div>
  );
}
