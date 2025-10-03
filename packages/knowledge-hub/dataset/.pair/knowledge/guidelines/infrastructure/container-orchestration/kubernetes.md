# Kubernetes Implementation

## Scope

Enterprise Kubernetes implementation covering cluster setup, workload management, security, networking, storage, and operational best practices for production-grade container orchestration.

## Content Summary

- **Cluster Architecture**: Multi-node setup, high availability, and infrastructure management
- **Workload Management**: Deployments, services, ingress, and scaling strategies
- **Security Framework**: RBAC, network policies, pod security, and compliance
- **Operational Excellence**: Monitoring, logging, backup, and disaster recovery

---

## Cluster Architecture

### Production Cluster Setup

```yaml
# Cluster Configuration (kubeadm-config.yaml)
apiVersion: kubeadm.k8s.io/v1beta3
kind: ClusterConfiguration
kubernetesVersion: v1.28.0
clusterName: production-cluster
controlPlaneEndpoint: 'k8s-api.company.com:6443'
networking:
  serviceSubnet: '10.96.0.0/12'
  podSubnet: '10.244.0.0/16'
  dnsDomain: 'cluster.local'
etcd:
  external:
    endpoints:
      - 'https://etcd1.company.com:2379'
      - 'https://etcd2.company.com:2379'
      - 'https://etcd3.company.com:2379'
    caFile: '/etc/kubernetes/pki/etcd/ca.crt'
    certFile: '/etc/kubernetes/pki/apiserver-etcd-client.crt'
    keyFile: '/etc/kubernetes/pki/apiserver-etcd-client.key'
apiServer:
  certSANs:
    - 'k8s-api.company.com'
    - '10.0.0.100'
  extraArgs:
    audit-log-maxage: '30'
    audit-log-maxbackup: '10'
    audit-log-maxsize: '100'
    audit-log-path: '/var/log/audit.log'
    audit-policy-file: '/etc/kubernetes/audit-policy.yaml'
## Cluster Architecture

### Production Cluster Setup

**High Availability Kubernetes Configuration**

Enterprise Kubernetes deployment requires multi-master architecture with load balancing, proper networking, and external etcd for production reliability. The setup includes control plane redundancy, worker node scaling, and network policy enforcement.

**Key Architecture Components:**

- **Control plane redundancy**: Multiple master nodes for high availability
- **External load balancer**: API server traffic distribution and failover
- **Network segregation**: Proper CIDR allocation for pods and services
- **External etcd cluster**: Separate etcd deployment for data resilience

**Standard Production Configuration:**

```yaml
# kubeadm-config.yaml - Production cluster
apiVersion: kubeadm.k8s.io/v1beta3
kind: ClusterConfiguration
kubernetesVersion: v1.28.0
controlPlaneEndpoint: 'k8s-api.company.com:6443'
networking:
  serviceSubnet: '10.96.0.0/12'
  podSubnet: '10.244.0.0/16'
etcd:
  external:
    endpoints:
      - https://etcd1.company.com:2379
      - https://etcd2.company.com:2379
      - https://etcd3.company.com:2379
```

### High Availability Implementation

**Automated Cluster Setup Process**

Production cluster setup requires systematic approach with dependency validation, security configuration, and service verification. The process includes system preparation, Kubernetes installation, and cluster initialization.

**Setup Process Overview:**

1. **System preparation**: Update packages, configure container runtime
2. **Kubernetes installation**: Install kubelet, kubeadm, kubectl components
3. **Cluster initialization**: Bootstrap first control plane node
4. **Node joining**: Add additional control and worker nodes
5. **Network setup**: Deploy CNI and configure network policies

**High Availability Benefits:**

- **Zero downtime maintenance**: Rolling updates without service interruption
- **Automatic failover**: Control plane redundancy with load balancing
- **Scalable architecture**: Dynamic worker node addition and removal
- **Disaster recovery**: Multi-zone deployment with backup strategies
    echo "👷 Joining worker nodes..."

    JOIN_COMMAND=$(kubeadm token create --print-join-command)

    for node in "${WORKER_NODES[@]}"; do
        echo "Joining worker node: $node"
        ssh "$node" "$JOIN_COMMAND"
    done

    echo "✅ All worker nodes joined!"
}

# Main execution
case "${1:-all}" in
    "deps")
        install_dependencies
        ;;
    "init")
        init_first_control_plane
        ;;
    "join-cp")
        join_control_plane_nodes
        ;;
    "join-workers")
        join_worker_nodes
        ;;
    "all")
        install_dependencies
        init_first_control_plane
        join_control_plane_nodes
        join_worker_nodes
        ;;
    *)
        echo "Usage: $0 {deps|init|join-cp|join-workers|all}"
        exit 1
        ;;
esac
```

---

## Workload Management

### Application Deployment Patterns

```yaml
# production-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  namespace: production
  labels:
    app: web-app
    version: v1.0.0
  annotations:
    deployment.kubernetes.io/revision: '1'
spec:
  replicas: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 25%
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
        version: v1.0.0
      annotations:
        prometheus.io/scrape: 'true'
        prometheus.io/port: '3000'
        prometheus.io/path: '/metrics'
    spec:
      serviceAccountName: web-app-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
      containers:
        - name: web-app
          image: registry.company.com/web-app:v1.0.0
          imagePullPolicy: Always
          ports:
            - containerPort: 3000
              name: http
              protocol: TCP
          env:
            - name: NODE_ENV
              value: 'production'
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: database-credentials
                  key: url
            - name: REDIS_URL
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: redis-url
          resources:
            requests:
              memory: '256Mi'
              cpu: '250m'
            limits:
              memory: '512Mi'
              cpu: '500m'
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          startupProbe:
            httpGet:
              path: /startup
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 30
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 1001
            capabilities:
              drop:
                - ALL
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: app-config
              mountPath: /app/config
              readOnly: true
      volumes:
        - name: tmp
          emptyDir: {}
        - name: app-config
          configMap:
            name: app-config
      nodeSelector:
        node-type: 'application'
      tolerations:
        - key: 'node-type'
          operator: 'Equal'
          value: 'application'
          effect: 'NoSchedule'
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - web-app
                topologyKey: kubernetes.io/hostname

---
apiVersion: v1
kind: Service
metadata:
  name: web-app-service
  namespace: production
  labels:
    app: web-app
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 3000
      protocol: TCP
      name: http
  selector:
    app: web-app

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-app-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: 'nginx'
    nginx.ingress.kubernetes.io/ssl-redirect: 'true'
    nginx.ingress.kubernetes.io/force-ssl-redirect: 'true'
    nginx.ingress.kubernetes.io/backend-protocol: 'HTTP'
    cert-manager.io/cluster-issuer: 'letsencrypt-prod'
    nginx.ingress.kubernetes.io/rate-limit: '100'
    nginx.ingress.kubernetes.io/rate-limit-window: '1m'
spec:
  tls:
    - hosts:
        - app.company.com
      secretName: web-app-tls
  rules:
    - host: app.company.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-app-service
                port:
                  number: 80
```

### Auto-scaling Configuration

```yaml
# hpa-configuration.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-app-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app
  minReplicas: 3
  maxReplicas: 50
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: requests_per_second
        target:
          type: AverageValue
          averageValue: '1000'
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
        - type: Pods
          value: 2
          periodSeconds: 60
      selectPolicy: Min
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60
        - type: Pods
          value: 4
          periodSeconds: 60
      selectPolicy: Max

---
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: web-app-vpa
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app
  updatePolicy:
    updateMode: 'Auto'
  resourcePolicy:
    containerPolicies:
      - containerName: web-app
        maxAllowed:
          cpu: '2'
          memory: '2Gi'
        minAllowed:
          cpu: '100m'
          memory: '128Mi'
        controlledResources: ['cpu', 'memory']
        controlledValues: RequestsAndLimits
```

---

## Security Implementation

### RBAC Configuration

```yaml
# rbac-configuration.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: web-app-sa
  namespace: production

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: web-app-role
rules:
  - apiGroups: ['']
    resources: ['pods', 'services', 'configmaps', 'secrets']
    verbs: ['get', 'list', 'watch']
  - apiGroups: ['apps']
    resources: ['deployments', 'replicasets']
    verbs: ['get', 'list', 'watch']

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: web-app-rolebinding
  namespace: production
subjects:
  - kind: ServiceAccount
    name: web-app-sa
    namespace: production
roleRef:
  kind: Role
  name: web-app-role
  apiGroup: rbac.authorization.k8s.io

---
# Cluster-level RBAC for system components
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: monitoring-reader
rules:
  - apiGroups: ['']
    resources: ['nodes', 'nodes/metrics', 'services', 'endpoints', 'pods']
    verbs: ['get', 'list', 'watch']
  - apiGroups: ['apps']
    resources: ['deployments', 'daemonsets', 'replicasets', 'statefulsets']
    verbs: ['get', 'list', 'watch']
  - apiGroups: ['networking.k8s.io']
    resources: ['ingresses']
    verbs: ['get', 'list', 'watch']

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: monitoring-reader-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: monitoring-reader
subjects:
  - kind: ServiceAccount
    name: prometheus
    namespace: monitoring
```

### Network Policies

```yaml
# network-policies.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-app-network-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: web-app
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000
    - from:
        - namespaceSelector:
            matchLabels:
              name: monitoring
        - podSelector:
            matchLabels:
              app: prometheus
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: database
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
    - to: []
      ports:
        - protocol: TCP
          port: 443
        - protocol: TCP
          port: 80
    - to: []
      ports:
        - protocol: UDP
          port: 53

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: database-network-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: database
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: web-app
        - podSelector:
            matchLabels:
              app: api-service
      ports:
        - protocol: TCP
          port: 5432
```

### Pod Security Standards

```yaml
# pod-security-standards.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted

---
apiVersion: v1
kind: Namespace
metadata:
  name: staging
  labels:
    pod-security.kubernetes.io/enforce: baseline
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted

---
apiVersion: v1
kind: Namespace
metadata:
  name: development
  labels:
    pod-security.kubernetes.io/enforce: baseline
    pod-security.kubernetes.io/audit: baseline
    pod-security.kubernetes.io/warn: baseline
```

---

## Storage Management

### Persistent Volume Configuration

```yaml
# storage-configuration.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
  annotations:
    storageclass.kubernetes.io/is-default-class: 'false'
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  iops: '3000'
  throughput: '125'
  encrypted: 'true'
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
reclaimPolicy: Delete

---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard-storage
  annotations:
    storageclass.kubernetes.io/is-default-class: 'true'
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  encrypted: 'true'
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
reclaimPolicy: Delete

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: database-storage
  namespace: production
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 100Gi

---
# StatefulSet with persistent storage
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: database
  namespace: production
spec:
  serviceName: database-headless
  replicas: 3
  selector:
    matchLabels:
      app: database
  template:
    metadata:
      labels:
        app: database
    spec:
      containers:
        - name: postgresql
          image: postgres:15-alpine
          env:
            - name: POSTGRES_DB
              value: 'myapp'
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: database-credentials
                  key: username
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: database-credentials
                  key: password
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
          resources:
            requests:
              memory: '1Gi'
              cpu: '500m'
            limits:
              memory: '2Gi'
              cpu: '1'
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ['ReadWriteOnce']
        storageClassName: fast-ssd
        resources:
          requests:
            storage: 50Gi
```

---

## Monitoring and Logging

### Prometheus Monitoring Stack

```yaml
# monitoring-stack.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      serviceAccountName: prometheus
      containers:
        - name: prometheus
          image: prom/prometheus:v2.40.0
          args:
            - '--config.file=/etc/prometheus/prometheus.yml'
            - '--storage.tsdb.path=/prometheus/'
            - '--web.console.libraries=/etc/prometheus/console_libraries'
            - '--web.console.templates=/etc/prometheus/consoles'
            - '--storage.tsdb.retention.time=15d'
            - '--web.enable-lifecycle'
          ports:
            - containerPort: 9090
          volumeMounts:
            - name: prometheus-config
              mountPath: /etc/prometheus/
            - name: prometheus-storage
              mountPath: /prometheus/
          resources:
            requests:
              memory: '2Gi'
              cpu: '1'
            limits:
              memory: '4Gi'
              cpu: '2'
      volumes:
        - name: prometheus-config
          configMap:
            name: prometheus-config
        - name: prometheus-storage
          persistentVolumeClaim:
            claimName: prometheus-storage

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s

    rule_files:
      - "alerts.yml"

    alerting:
      alertmanagers:
        - static_configs:
            - targets:
              - alertmanager:9093

    scrape_configs:
      - job_name: 'kubernetes-pods'
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
            action: keep
            regex: true
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
            action: replace
            target_label: __metrics_path__
            regex: (.+)
          - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
            action: replace
            regex: ([^:]+)(?::\d+)?;(\d+)
            replacement: $1:$2
            target_label: __address__
      
      - job_name: 'kubernetes-nodes'
        kubernetes_sd_configs:
          - role: node
        relabel_configs:
          - action: labelmap
            regex: __meta_kubernetes_node_label_(.+)
      
      - job_name: 'kubernetes-services'
        kubernetes_sd_configs:
          - role: service
        relabel_configs:
          - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scrape]
            action: keep
            regex: true
          - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_path]
            action: replace
            target_label: __metrics_path__
            regex: (.+)
```

---

## Backup and Disaster Recovery

### Velero Backup Configuration

```yaml
# velero-backup.yaml
apiVersion: velero.io/v1
kind: Backup
metadata:
  name: daily-backup
  namespace: velero
spec:
  includedNamespaces:
    - production
    - staging
  excludedResources:
    - secrets
    - configmaps
  storageLocation: default
  volumeSnapshotLocations:
    - default
  ttl: 720h0m0s

---
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: daily-backup-schedule
  namespace: velero
spec:
  schedule: '0 2 * * *'
  template:
    includedNamespaces:
      - production
      - staging
    excludedResources:
      - secrets
      - configmaps
    storageLocation: default
    volumeSnapshotLocations:
      - default
    ttl: 720h0m0s

---
apiVersion: velero.io/v1
kind: BackupStorageLocation
metadata:
  name: default
  namespace: velero
spec:
  provider: aws
  objectStorage:
    bucket: company-k8s-backups
    prefix: velero
  config:
    region: us-east-1
    s3ForcePathStyle: 'false'
```

This comprehensive Kubernetes implementation guide provides enterprise-grade container orchestration with security, scalability, and operational excellence built-in.
