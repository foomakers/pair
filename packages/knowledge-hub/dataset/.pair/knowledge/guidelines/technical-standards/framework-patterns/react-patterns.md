# React Advanced Patterns

## Strategic Overview

This framework establishes advanced React patterns that optimize component design, state management, and performance while ensuring code reusability, maintainability, and type safety through systematic application of modern React paradigms.

## Advanced Hook Patterns

### Custom Hook Composition

#### **Data Fetching Hook with Advanced Features**
```typescript
// useAdvancedFetch.ts - Comprehensive data fetching hook
interface FetchConfig<T> {
  enabled?: boolean;
  refetchInterval?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  retryCount?: number;
  retryDelay?: number;
  staleTime?: number;
  cacheTime?: number;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
  select?: (data: T) => any;
  suspense?: boolean;
}

interface FetchResult<T, TSelected = T> {
  data: TSelected | undefined;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
  isStale: boolean;
  refetch: () => Promise<void>;
  mutate: (newData: T | ((prevData: T | undefined) => T)) => void;
  invalidate: () => void;
}

function useAdvancedFetch<T, TSelected = T>(
  key: string,
  fetcher: () => Promise<T>,
  config: FetchConfig<T> = {}
): FetchResult<T, TSelected> {
  const {
    enabled = true,
    refetchInterval,
    refetchOnWindowFocus = true,
    refetchOnReconnect = true,
    retryCount = 3,
    retryDelay = 1000,
    staleTime = 5 * 60 * 1000, // 5 minutes
    cacheTime = 10 * 60 * 1000, // 10 minutes
    onSuccess,
    onError,
    onSettled,
    select,
    suspense = false
  } = config;

  // State management
  const [state, setState] = useState<{
    data: T | undefined;
    error: Error | null;
    isLoading: boolean;
    isFetching: boolean;
    lastFetchTime: number;
    retryAttempt: number;
  }>({
    data: undefined,
    error: null,
    isLoading: false,
    isFetching: false,
    lastFetchTime: 0,
    retryAttempt: 0
  });

  // Cache management
  const cache = useRef<Map<string, { data: T; timestamp: number }>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Computed values
  const isStale = useMemo(() => {
    return Date.now() - state.lastFetchTime > staleTime;
  }, [state.lastFetchTime, staleTime]);

  const selectedData = useMemo(() => {
    if (!state.data) return undefined;
    return select ? select(state.data) : state.data;
  }, [state.data, select]) as TSelected | undefined;

  // Fetch function with retry logic
  const fetchData = useCallback(async (isRetry = false) => {
    // Check cache first
    const cached = cache.current.get(key);
    if (cached && !isStale && !isRetry) {
      setState(prev => ({
        ...prev,
        data: cached.data,
        isLoading: false,
        error: null
      }));
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      isLoading: prev.data === undefined,
      isFetching: true,
      error: null
    }));

    try {
      const data = await fetcher();
      
      // Update cache
      cache.current.set(key, {
        data,
        timestamp: Date.now()
      });

      setState(prev => ({
        ...prev,
        data,
        isLoading: false,
        isFetching: false,
        lastFetchTime: Date.now(),
        retryAttempt: 0,
        error: null
      }));

      onSuccess?.(data);
    } catch (error) {
      const err = error as Error;
      
      if (err.name === 'AbortError') {
        return; // Request was cancelled
      }

      // Retry logic
      if (state.retryAttempt < retryCount) {
        setState(prev => ({
          ...prev,
          retryAttempt: prev.retryAttempt + 1
        }));

        setTimeout(() => {
          fetchData(true);
        }, retryDelay * Math.pow(2, state.retryAttempt)); // Exponential backoff

        return;
      }

      setState(prev => ({
        ...prev,
        error: err,
        isLoading: false,
        isFetching: false,
        retryAttempt: 0
      }));

      onError?.(err);
    } finally {
      onSettled?.();
    }
  }, [key, fetcher, isStale, state.retryAttempt, retryCount, retryDelay, onSuccess, onError, onSettled]);

  // Manual refetch
  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // Optimistic updates
  const mutate = useCallback((newData: T | ((prevData: T | undefined) => T)) => {
    setState(prev => ({
      ...prev,
      data: typeof newData === 'function' 
        ? (newData as (prevData: T | undefined) => T)(prev.data)
        : newData
    }));

    // Update cache
    const finalData = typeof newData === 'function' 
      ? (newData as (prevData: T | undefined) => T)(state.data)
      : newData;
    
    cache.current.set(key, {
      data: finalData,
      timestamp: Date.now()
    });
  }, [key, state.data]);

  // Cache invalidation
  const invalidate = useCallback(() => {
    cache.current.delete(key);
    setState(prev => ({
      ...prev,
      lastFetchTime: 0
    }));
  }, [key]);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      fetchData();
    }
  }, [enabled, fetchData]);

  // Interval refetch
  useEffect(() => {
    if (refetchInterval && enabled) {
      const interval = setInterval(() => {
        if (!document.hidden) {
          fetchData();
        }
      }, refetchInterval);

      return () => clearInterval(interval);
    }
  }, [refetchInterval, enabled, fetchData]);

  // Window focus refetch
  useEffect(() => {
    if (refetchOnWindowFocus && enabled) {
      const handleFocus = () => {
        if (isStale) {
          fetchData();
        }
      };

      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
    }
  }, [refetchOnWindowFocus, enabled, isStale, fetchData]);

  // Network reconnect refetch
  useEffect(() => {
    if (refetchOnReconnect && enabled) {
      const handleOnline = () => {
        fetchData();
      };

      window.addEventListener('online', handleOnline);
      return () => window.removeEventListener('online', handleOnline);
    }
  }, [refetchOnReconnect, enabled, fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Suspense support
  if (suspense && state.isLoading && !state.data) {
    throw fetchData();
  }

  return {
    data: selectedData,
    error: state.error,
    isLoading: state.isLoading,
    isFetching: state.isFetching,
    isError: !!state.error,
    isSuccess: !!state.data && !state.error,
    isStale,
    refetch,
    mutate,
    invalidate
  };
}

// Usage example
function UserProfile({ userId }: { userId: string }) {
  const {
    data: user,
    isLoading,
    error,
    refetch,
    mutate
  } = useAdvancedFetch(
    `user-${userId}`,
    () => userApi.getUser(userId),
    {
      refetchInterval: 30000, // Refetch every 30 seconds
      onSuccess: (user) => {
        console.log('User loaded:', user.name);
      },
      onError: (error) => {
        toast.error('Failed to load user');
      },
      select: (user) => ({
        ...user,
        displayName: `${user.firstName} ${user.lastName}`
      })
    }
  );

  const handleUpdateUser = async (updates: Partial<User>) => {
    // Optimistic update
    mutate(prevUser => prevUser ? { ...prevUser, ...updates } : prevUser);
    
    try {
      await userApi.updateUser(userId, updates);
      refetch(); // Sync with server
    } catch (error) {
      refetch(); // Revert on error
      toast.error('Failed to update user');
    }
  };

  if (isLoading) return <UserSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={refetch} />;
  if (!user) return <UserNotFound />;

  return (
    <div>
      <h1>{user.displayName}</h1>
      <UserForm user={user} onUpdate={handleUpdateUser} />
    </div>
  );
}
```

#### **Form Hook with Validation and Submission**
```typescript
// useForm.ts - Advanced form management hook
interface FormConfig<T> {
  initialValues: T;
  validationSchema?: any; // Yup schema or custom validator
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  onSubmit: (values: T) => Promise<void> | void;
  onError?: (errors: FormErrors<T>) => void;
  onReset?: () => void;
}

type FormErrors<T> = {
  [K in keyof T]?: string;
};

interface FormState<T> {
  values: T;
  errors: FormErrors<T>;
  touched: { [K in keyof T]?: boolean };
  isSubmitting: boolean;
  isValidating: boolean;
  isValid: boolean;
  submitCount: number;
}

interface FormActions<T> {
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setValues: (values: Partial<T>) => void;
  setError: <K extends keyof T>(field: K, error: string) => void;
  setErrors: (errors: FormErrors<T>) => void;
  setTouched: <K extends keyof T>(field: K, touched?: boolean) => void;
  setFieldTouched: <K extends keyof T>(field: K) => void;
  validateField: <K extends keyof T>(field: K) => Promise<string | undefined>;
  validateForm: () => Promise<FormErrors<T>>;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  handleReset: () => void;
  getFieldProps: <K extends keyof T>(field: K) => FieldProps<T[K]>;
  getFieldMeta: <K extends keyof T>(field: K) => FieldMeta;
}

interface FieldProps<T> {
  name: string;
  value: T;
  onChange: (e: React.ChangeEvent<any>) => void;
  onBlur: (e: React.FocusEvent<any>) => void;
}

interface FieldMeta {
  touched: boolean;
  error?: string;
  invalid: boolean;
  valid: boolean;
}

function useForm<T extends Record<string, any>>(
  config: FormConfig<T>
): [FormState<T>, FormActions<T>] {
  const {
    initialValues,
    validationSchema,
    validateOnChange = true,
    validateOnBlur = true,
    onSubmit,
    onError,
    onReset
  } = config;

  // Form state
  const [state, setState] = useState<FormState<T>>({
    values: { ...initialValues },
    errors: {},
    touched: {},
    isSubmitting: false,
    isValidating: false,
    isValid: true,
    submitCount: 0
  });

  // Validation function
  const validateField = useCallback(async <K extends keyof T>(
    field: K,
    value: T[K] = state.values[field]
  ): Promise<string | undefined> => {
    if (!validationSchema) return undefined;

    try {
      await validationSchema.validateAt(field, { [field]: value });
      return undefined;
    } catch (error: any) {
      return error.message;
    }
  }, [validationSchema, state.values]);

  const validateForm = useCallback(async (): Promise<FormErrors<T>> => {
    if (!validationSchema) return {};

    setState(prev => ({ ...prev, isValidating: true }));

    try {
      await validationSchema.validate(state.values, { abortEarly: false });
      setState(prev => ({ ...prev, isValidating: false }));
      return {};
    } catch (error: any) {
      const errors: FormErrors<T> = {};
      
      if (error.inner) {
        error.inner.forEach((err: any) => {
          if (err.path) {
            errors[err.path as keyof T] = err.message;
          }
        });
      }

      setState(prev => ({ 
        ...prev, 
        errors,
        isValid: Object.keys(errors).length === 0,
        isValidating: false 
      }));

      return errors;
    }
  }, [validationSchema, state.values]);

  // Actions
  const setValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setState(prev => ({
      ...prev,
      values: { ...prev.values, [field]: value }
    }));

    // Validate on change if enabled
    if (validateOnChange && validationSchema) {
      validateField(field, value).then(error => {
        setState(prev => ({
          ...prev,
          errors: { ...prev.errors, [field]: error },
          isValid: !error && Object.values({ ...prev.errors, [field]: error }).every(e => !e)
        }));
      });
    }
  }, [validateOnChange, validationSchema, validateField]);

  const setValues = useCallback((values: Partial<T>) => {
    setState(prev => ({
      ...prev,
      values: { ...prev.values, ...values }
    }));
  }, []);

  const setError = useCallback(<K extends keyof T>(field: K, error: string) => {
    setState(prev => ({
      ...prev,
      errors: { ...prev.errors, [field]: error }
    }));
  }, []);

  const setErrors = useCallback((errors: FormErrors<T>) => {
    setState(prev => ({
      ...prev,
      errors,
      isValid: Object.keys(errors).length === 0
    }));
  }, []);

  const setTouched = useCallback(<K extends keyof T>(field: K, touched = true) => {
    setState(prev => ({
      ...prev,
      touched: { ...prev.touched, [field]: touched }
    }));
  }, []);

  const setFieldTouched = useCallback(<K extends keyof T>(field: K) => {
    setTouched(field, true);

    // Validate on blur if enabled
    if (validateOnBlur && validationSchema) {
      validateField(field).then(error => {
        setState(prev => ({
          ...prev,
          errors: { ...prev.errors, [field]: error }
        }));
      });
    }
  }, [validateOnBlur, validationSchema, validateField, setTouched]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    setState(prev => ({ 
      ...prev, 
      isSubmitting: true,
      submitCount: prev.submitCount + 1
    }));

    // Mark all fields as touched
    const allTouched = Object.keys(state.values).reduce((acc, key) => {
      acc[key as keyof T] = true;
      return acc;
    }, {} as { [K in keyof T]: boolean });

    setState(prev => ({ ...prev, touched: allTouched }));

    // Validate form
    const errors = await validateForm();
    
    if (Object.keys(errors).length > 0) {
      setState(prev => ({ ...prev, isSubmitting: false }));
      onError?.(errors);
      return;
    }

    try {
      await onSubmit(state.values);
    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      setState(prev => ({ ...prev, isSubmitting: false }));
    }
  }, [state.values, validateForm, onSubmit, onError]);

  const handleReset = useCallback(() => {
    setState({
      values: { ...initialValues },
      errors: {},
      touched: {},
      isSubmitting: false,
      isValidating: false,
      isValid: true,
      submitCount: 0
    });
    onReset?.();
  }, [initialValues, onReset]);

  const getFieldProps = useCallback(<K extends keyof T>(field: K): FieldProps<T[K]> => ({
    name: String(field),
    value: state.values[field],
    onChange: (e: React.ChangeEvent<any>) => {
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setValue(field, value);
    },
    onBlur: () => setFieldTouched(field)
  }), [state.values, setValue, setFieldTouched]);

  const getFieldMeta = useCallback(<K extends keyof T>(field: K): FieldMeta => ({
    touched: !!state.touched[field],
    error: state.errors[field],
    invalid: !!state.errors[field],
    valid: !state.errors[field]
  }), [state.touched, state.errors]);

  return [
    state,
    {
      setValue,
      setValues,
      setError,
      setErrors,
      setTouched,
      setFieldTouched,
      validateField,
      validateForm,
      handleSubmit,
      handleReset,
      getFieldProps,
      getFieldMeta
    }
  ];
}

// Usage example with Yup validation
import * as Yup from 'yup';

const userSchema = Yup.object({
  email: Yup.string().email('Invalid email').required('Email is required'),
  password: Yup.string().min(8, 'Password must be at least 8 characters').required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'Passwords must match')
    .required('Confirm password is required'),
  terms: Yup.boolean().oneOf([true], 'You must accept the terms')
});

interface UserFormData {
  email: string;
  password: string;
  confirmPassword: string;
  terms: boolean;
}

function UserRegistrationForm() {
  const [formState, formActions] = useForm<UserFormData>({
    initialValues: {
      email: '',
      password: '',
      confirmPassword: '',
      terms: false
    },
    validationSchema: userSchema,
    onSubmit: async (values) => {
      await userApi.register({
        email: values.email,
        password: values.password
      });
      toast.success('Registration successful!');
    },
    onError: (errors) => {
      toast.error('Please fix the form errors');
    }
  });

  return (
    <form onSubmit={formActions.handleSubmit}>
      <div>
        <input
          type="email"
          placeholder="Email"
          {...formActions.getFieldProps('email')}
        />
        {formActions.getFieldMeta('email').touched && 
         formActions.getFieldMeta('email').error && (
          <span className="error">{formActions.getFieldMeta('email').error}</span>
        )}
      </div>

      <div>
        <input
          type="password"
          placeholder="Password"
          {...formActions.getFieldProps('password')}
        />
        {formActions.getFieldMeta('password').touched && 
         formActions.getFieldMeta('password').error && (
          <span className="error">{formActions.getFieldMeta('password').error}</span>
        )}
      </div>

      <div>
        <input
          type="password"
          placeholder="Confirm Password"
          {...formActions.getFieldProps('confirmPassword')}
        />
        {formActions.getFieldMeta('confirmPassword').touched && 
         formActions.getFieldMeta('confirmPassword').error && (
          <span className="error">{formActions.getFieldMeta('confirmPassword').error}</span>
        )}
      </div>

      <div>
        <label>
          <input
            type="checkbox"
            {...formActions.getFieldProps('terms')}
          />
          I accept the terms and conditions
        </label>
        {formActions.getFieldMeta('terms').touched && 
         formActions.getFieldMeta('terms').error && (
          <span className="error">{formActions.getFieldMeta('terms').error}</span>
        )}
      </div>

      <div>
        <button 
          type="submit" 
          disabled={formState.isSubmitting || !formState.isValid}
        >
          {formState.isSubmitting ? 'Registering...' : 'Register'}
        </button>
        <button type="button" onClick={formActions.handleReset}>
          Reset
        </button>
      </div>
    </form>
  );
}
```

## Performance Optimization Patterns

### React.memo and useMemo Optimization

#### **Smart Memoization Strategies**
```tsx
// Memoization utilities
const shallowEqual = (obj1: any, obj2: any): boolean => {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (let key of keys1) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }

  return true;
};

const deepEqual = (obj1: any, obj2: any): boolean => {
  if (obj1 === obj2) return true;
  
  if (obj1 == null || obj2 == null) return false;
  
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return obj1 === obj2;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (let key of keys1) {
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
};

// Advanced memo component with custom comparison
interface UserCardProps {
  user: User;
  actions: UserActions;
  settings: UserSettings;
  onUpdate: (user: User) => void;
  className?: string;
}

const UserCard = React.memo<UserCardProps>(({
  user,
  actions,
  settings,
  onUpdate,
  className
}) => {
  // Memoize expensive calculations
  const userDisplayName = useMemo(() => {
    return `${user.firstName} ${user.lastName} (${user.email})`;
  }, [user.firstName, user.lastName, user.email]);

  const userPermissions = useMemo(() => {
    return calculateUserPermissions(user.role, user.permissions);
  }, [user.role, user.permissions]);

  const userStats = useMemo(() => {
    return calculateUserStats(user.activities, user.createdAt);
  }, [user.activities, user.createdAt]);

  // Memoize event handlers
  const handleEdit = useCallback(() => {
    actions.editUser(user.id);
  }, [actions.editUser, user.id]);

  const handleDelete = useCallback(() => {
    actions.deleteUser(user.id);
  }, [actions.deleteUser, user.id]);

  const handleStatusToggle = useCallback(() => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    onUpdate({ ...user, status: newStatus });
  }, [user, onUpdate]);

  // Conditional rendering based on settings
  if (!settings.showInactiveUsers && user.status === 'inactive') {
    return null;
  }

  return (
    <div className={cn('user-card', className)}>
      <div className="user-info">
        <h3>{userDisplayName}</h3>
        <p>Status: {user.status}</p>
        <p>Role: {user.role}</p>
        
        {settings.showPermissions && (
          <div className="permissions">
            <h4>Permissions:</h4>
            <ul>
              {userPermissions.map(permission => (
                <li key={permission}>{permission}</li>
              ))}
            </ul>
          </div>
        )}

        {settings.showStats && (
          <div className="stats">
            <h4>Statistics:</h4>
            <p>Login Count: {userStats.loginCount}</p>
            <p>Last Activity: {userStats.lastActivity}</p>
            <p>Account Age: {userStats.accountAge} days</p>
          </div>
        )}
      </div>

      <div className="user-actions">
        <button onClick={handleEdit}>Edit</button>
        <button onClick={handleDelete}>Delete</button>
        <button onClick={handleStatusToggle}>
          {user.status === 'active' ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for optimal re-rendering
  
  // Always re-render if className changes
  if (prevProps.className !== nextProps.className) {
    return false;
  }

  // Deep compare user object (most likely to change)
  if (!deepEqual(prevProps.user, nextProps.user)) {
    return false;
  }

  // Shallow compare settings (occasionally changes)
  if (!shallowEqual(prevProps.settings, nextProps.settings)) {
    return false;
  }

  // Reference compare for actions and callbacks (should be memoized by parent)
  if (prevProps.actions !== nextProps.actions || 
      prevProps.onUpdate !== nextProps.onUpdate) {
    return false;
  }

  return true; // Props are equal, skip re-render
});

UserCard.displayName = 'UserCard';

// Parent component with proper memoization
interface UserListProps {
  users: User[];
  onUserUpdate: (user: User) => void;
}

function UserList({ users, onUserUpdate }: UserListProps) {
  const [settings, setSettings] = useState<UserSettings>({
    showInactiveUsers: true,
    showPermissions: false,
    showStats: true
  });

  // Memoize actions to prevent unnecessary re-renders
  const userActions = useMemo(() => ({
    editUser: (userId: string) => {
      // Edit user logic
      console.log('Editing user:', userId);
    },
    deleteUser: (userId: string) => {
      // Delete user logic
      console.log('Deleting user:', userId);
    }
  }), []);

  // Memoize filtered users
  const filteredUsers = useMemo(() => {
    return users.filter(user => 
      settings.showInactiveUsers || user.status === 'active'
    );
  }, [users, settings.showInactiveUsers]);

  return (
    <div className="user-list">
      <div className="settings">
        <label>
          <input
            type="checkbox"
            checked={settings.showInactiveUsers}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              showInactiveUsers: e.target.checked
            }))}
          />
          Show Inactive Users
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.showPermissions}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              showPermissions: e.target.checked
            }))}
          />
          Show Permissions
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.showStats}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              showStats: e.target.checked
            }))}
          />
          Show Statistics
        </label>
      </div>

      <div className="users">
        {filteredUsers.map(user => (
          <UserCard
            key={user.id}
            user={user}
            actions={userActions}
            settings={settings}
            onUpdate={onUserUpdate}
          />
        ))}
      </div>
    </div>
  );
}
```

### Virtual Scrolling Implementation

#### **Custom Virtual Scrolling Hook**
```tsx
// useVirtualScrolling.ts
interface VirtualScrollingConfig {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  scrollingDelay?: number;
}

interface VirtualScrollingResult {
  virtualItems: VirtualItem[];
  totalHeight: number;
  scrollElementProps: {
    ref: React.RefObject<HTMLDivElement>;
    onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
    style: React.CSSProperties;
  };
  isScrolling: boolean;
}

interface VirtualItem {
  index: number;
  start: number;
  end: number;
  size: number;
}

function useVirtualScrolling<T>(
  items: T[],
  config: VirtualScrollingConfig
): VirtualScrollingResult {
  const {
    itemHeight,
    containerHeight,
    overscan = 5,
    scrollingDelay = 150
  } = config;

  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const scrollingTimeoutRef = useRef<NodeJS.Timeout>();

  // Calculate visible range
  const { startIndex, endIndex, virtualItems } = useMemo(() => {
    const visibleStartIndex = Math.floor(scrollTop / itemHeight);
    const visibleEndIndex = Math.min(
      visibleStartIndex + Math.ceil(containerHeight / itemHeight),
      items.length - 1
    );

    const startIndex = Math.max(0, visibleStartIndex - overscan);
    const endIndex = Math.min(items.length - 1, visibleEndIndex + overscan);

    const virtualItems: VirtualItem[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      virtualItems.push({
        index: i,
        start: i * itemHeight,
        end: (i + 1) * itemHeight,
        size: itemHeight
      });
    }

    return { startIndex, endIndex, virtualItems };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  const totalHeight = items.length * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setScrollTop(scrollTop);
    setIsScrolling(true);

    // Clear existing timeout
    if (scrollingTimeoutRef.current) {
      clearTimeout(scrollingTimeoutRef.current);
    }

    // Set new timeout to detect end of scrolling
    scrollingTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, scrollingDelay);
  }, [scrollingDelay]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollingTimeoutRef.current) {
        clearTimeout(scrollingTimeoutRef.current);
      }
    };
  }, []);

  return {
    virtualItems,
    totalHeight,
    scrollElementProps: {
      ref: scrollElementRef,
      onScroll: handleScroll,
      style: {
        height: containerHeight,
        overflow: 'auto'
      }
    },
    isScrolling
  };
}

// Virtual List Component
interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  renderItem: (item: T, index: number, isScrolling: boolean) => React.ReactNode;
  className?: string;
  overscan?: number;
}

function VirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
  className,
  overscan = 5
}: VirtualListProps<T>) {
  const {
    virtualItems,
    totalHeight,
    scrollElementProps,
    isScrolling
  } = useVirtualScrolling(items, {
    itemHeight,
    containerHeight: height,
    overscan
  });

  return (
    <div {...scrollElementProps} className={cn('virtual-list', className)}>
      <div
        style={{
          height: totalHeight,
          position: 'relative'
        }}
      >
        {virtualItems.map(virtualItem => (
          <div
            key={virtualItem.index}
            style={{
              position: 'absolute',
              top: virtualItem.start,
              left: 0,
              right: 0,
              height: virtualItem.size
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index, isScrolling)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Usage example
interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

function UserListWithVirtualScrolling({ users }: { users: User[] }) {
  const renderUser = useCallback((user: User, index: number, isScrolling: boolean) => (
    <div className="user-item">
      {!isScrolling && (
        <img 
          src={user.avatar} 
          alt={user.name}
          className="user-avatar"
          loading="lazy"
        />
      )}
      <div className="user-info">
        <h3>{user.name}</h3>
        <p>{user.email}</p>
      </div>
    </div>
  ), []);

  return (
    <VirtualList
      items={users}
      itemHeight={80}
      height={600}
      renderItem={renderUser}
      className="users-virtual-list"
      overscan={10}
    />
  );
}
```

## Context and State Management Patterns

### Advanced Context Pattern

#### **Typed Context with Provider Pattern**
```tsx
// context/ThemeContext.tsx
interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
  isLight: boolean;
}

interface Theme {
  mode: 'light' | 'dark' | 'system';
  primaryColor: string;
  secondaryColor: string;
  fontSize: 'small' | 'medium' | 'large';
  animations: boolean;
}

const defaultTheme: Theme = {
  mode: 'system',
  primaryColor: '#007bff',
  secondaryColor: '#6c757d',
  fontSize: 'medium',
  animations: true
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Partial<Theme>;
  storageKey?: string;
}

export function ThemeProvider({ 
  children, 
  defaultTheme: propDefaultTheme = {},
  storageKey = 'app-theme'
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Initialize from localStorage or use default
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          return { ...defaultTheme, ...JSON.parse(stored) };
        }
      } catch (error) {
        console.warn('Failed to parse theme from localStorage:', error);
      }
    }
    return { ...defaultTheme, ...propDefaultTheme };
  });

  // Detect system theme preference
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Persist theme changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(theme));
      } catch (error) {
        console.warn('Failed to save theme to localStorage:', error);
      }
    }
  }, [theme, storageKey]);

  // Apply CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const resolvedMode = theme.mode === 'system' ? systemTheme : theme.mode;

    root.setAttribute('data-theme', resolvedMode);
    root.style.setProperty('--primary-color', theme.primaryColor);
    root.style.setProperty('--secondary-color', theme.secondaryColor);
    root.style.setProperty('--font-size-base', 
      theme.fontSize === 'small' ? '14px' : 
      theme.fontSize === 'large' ? '18px' : '16px'
    );
    root.style.setProperty('--animations-enabled', 
      theme.animations ? '1' : '0'
    );
  }, [theme, systemTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => ({
      ...prev,
      mode: prev.mode === 'light' ? 'dark' : prev.mode === 'dark' ? 'system' : 'light'
    }));
  }, []);

  const isDark = useMemo(() => {
    const resolvedMode = theme.mode === 'system' ? systemTheme : theme.mode;
    return resolvedMode === 'dark';
  }, [theme.mode, systemTheme]);

  const isLight = useMemo(() => {
    const resolvedMode = theme.mode === 'system' ? systemTheme : theme.mode;
    return resolvedMode === 'light';
  }, [theme.mode, systemTheme]);

  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme,
    isDark,
    isLight
  }), [theme, setTheme, toggleTheme, isDark, isLight]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// Usage
function App() {
  return (
    <ThemeProvider defaultTheme={{ mode: 'dark', animations: false }}>
      <MainLayout />
    </ThemeProvider>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme, isDark } = useTheme();
  
  return (
    <button onClick={toggleTheme}>
      Current: {theme.mode} ({isDark ? 'Dark' : 'Light'})
    </button>
  );
}
```

This comprehensive React patterns guide provides advanced patterns for hooks, performance optimization, and context management that ensure scalable, maintainable, and high-performance React applications.