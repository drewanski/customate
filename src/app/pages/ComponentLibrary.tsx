import React, { useState } from 'react';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Select } from '@/app/components/Select';
import { Textarea } from '@/app/components/Textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/Card';
import { Badge } from '@/app/components/Badge';
import { Tabs } from '@/app/components/Tabs';
import { Modal } from '@/app/components/Modal';
import { Table, TableColumn } from '@/app/components/Table';
import { Stepper } from '@/app/components/Stepper';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { ToastContainer, ToastType } from '@/app/components/Toast';
import { Heart } from 'lucide-react';

interface DemoItem {
  id: string;
  name: string;
  role: string;
}

export function ComponentLibrary() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: ToastType }>>([]);
  
  const addToast = (type: ToastType) => {
    const id = Date.now().toString();
    setToasts([...toasts, { id, message: `This is a ${type} toast message!`, type }]);
  };
  
  const removeToast = (id: string) => {
    setToasts(toasts.filter(t => t.id !== id));
  };
  
  const demoData: DemoItem[] = [
    { id: '1', name: 'John Doe', role: 'Developer' },
    { id: '2', name: 'Jane Smith', role: 'Designer' },
    { id: '3', name: 'Bob Johnson', role: 'Manager' },
  ];
  
  const tableColumns: TableColumn<DemoItem>[] = [
    { key: 'name', header: 'Name' },
    { key: 'role', header: 'Role' },
    {
      key: 'id',
      header: 'Actions',
      render: () => <Button size="sm" variant="outline">Edit</Button>
    }
  ];
  
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-gray-900 mb-2">Component Library</h1>
      <p className="text-lg text-gray-600 mb-8">Reusable components with variants and states</p>
      
      {/* Buttons */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Buttons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="font-medium mb-3">Variants</h4>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-3">Sizes</h4>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-3">States</h4>
            <div className="flex flex-wrap gap-3">
              <Button>Normal</Button>
              <Button disabled>Disabled</Button>
              <Button loading>Loading</Button>
              <Button><Heart className="w-4 h-4 mr-2" />With Icon</Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Form Inputs */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Form Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Text Input" placeholder="Enter text..." />
            <Input label="With Error" error="This field is required" />
            <Input label="Disabled" disabled value="Disabled input" />
            <Input label="With Helper" helperText="This is a helper text" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Select
              label="Select Dropdown"
              options={[
                { value: '1', label: 'Option 1' },
                { value: '2', label: 'Option 2' },
                { value: '3', label: 'Option 3' },
              ]}
            />
            <Textarea label="Textarea" placeholder="Enter long text..." rows={3} />
          </div>
        </CardContent>
      </Card>
      
      {/* Badges */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Badges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Badge variant="default">Default</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="info">Info</Badge>
            <Badge size="sm">Small</Badge>
            <Badge size="md">Medium</Badge>
          </div>
        </CardContent>
      </Card>
      
      {/* Cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">This is a card with standard padding.</p>
          </CardContent>
        </Card>
        <Card hover>
          <CardHeader>
            <CardTitle>Hover Card</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">This card has hover effect.</p>
          </CardContent>
        </Card>
        <Card padding="lg">
          <CardHeader>
            <CardTitle>Large Padding</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">This card has large padding.</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Tabs */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Tabs</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs
            tabs={[
              { id: 'tab1', label: 'Tab 1', content: <p>Content for Tab 1</p> },
              { id: 'tab2', label: 'Tab 2', content: <p>Content for Tab 2</p> },
              { id: 'tab3', label: 'Tab 3', content: <p>Content for Tab 3</p> },
            ]}
          />
        </CardContent>
      </Card>
      
      {/* Modal */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Modal</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setIsModalOpen(true)}>Open Modal</Button>
          <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title="Example Modal"
            footer={
              <>
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button onClick={() => setIsModalOpen(false)}>Confirm</Button>
              </>
            }
          >
            <p className="text-gray-600">This is the modal content. You can put any content here.</p>
          </Modal>
        </CardContent>
      </Card>
      
      {/* Table */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Table</CardTitle>
        </CardHeader>
        <CardContent>
          <Table columns={tableColumns} data={demoData} />
        </CardContent>
      </Card>
      
      {/* Toast */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Toast Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => addToast('success')}>Success Toast</Button>
            <Button onClick={() => addToast('error')}>Error Toast</Button>
            <Button onClick={() => addToast('warning')}>Warning Toast</Button>
            <Button onClick={() => addToast('info')}>Info Toast</Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Stepper */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Stepper / Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <Stepper
            steps={[
              { id: '1', label: 'Step 1', description: 'First step' },
              { id: '2', label: 'Step 2', description: 'Second step' },
              { id: '3', label: 'Step 3', description: 'Third step' },
              { id: '4', label: 'Step 4', description: 'Fourth step' },
            ]}
            currentStep={1}
          />
        </CardContent>
      </Card>
      
      {/* Breadcrumbs */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Breadcrumbs</CardTitle>
        </CardHeader>
        <CardContent>
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/' },
              { label: 'Products', href: '/products' },
              { label: 'Details' },
            ]}
          />
        </CardContent>
      </Card>
      
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
