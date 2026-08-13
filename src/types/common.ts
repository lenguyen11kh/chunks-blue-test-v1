export interface Learner {
  id: string;
  name: string;
  code: string;
  avatarUrl?: string;
  grade?: string;
  assignedPackageId?: string;
  isActive?: boolean;
}

export type TestType = 'green' | 'red' | 'blue';

export interface UserRole {
  id: string;
  name: string;
  role: 'teacher' | 'admin';
}
