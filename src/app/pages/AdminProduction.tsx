import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/Card';
import { Badge } from '@/app/components/Badge';
import { mockTasks } from '@/app/data/mockData';
import { ProductionTask, TaskStatus } from '@/app/data/types';

export function AdminProduction() {
  const [tasks, setTasks] = useState(mockTasks);
  
  const columns: { status: TaskStatus; title: string; color: string }[] = [
    { status: 'todo', title: 'To Do', color: 'bg-gray-100' },
    { status: 'in_progress', title: 'In Progress', color: 'bg-blue-100' },
    { status: 'done', title: 'Done', color: 'bg-green-100' },
  ];
  
  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter(task => task.status === status);
  };
  
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'danger';
      case 'medium': return 'warning';
      default: return 'default';
    }
  };
  
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Production Tasks</h1>
      
      <div className="grid lg:grid-cols-3 gap-6">
        {columns.map((column) => (
          <div key={column.status}>
            <Card className={`${column.color} border-2 mb-4`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {column.title}
                  <Badge>{getTasksByStatus(column.status).length}</Badge>
                </CardTitle>
              </CardHeader>
            </Card>
            
            <div className="space-y-4">
              {getTasksByStatus(column.status).map((task) => (
                <Card key={task.id} hover className="cursor-move">
                  <CardContent>
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{task.title}</h4>
                      <Badge variant={getPriorityColor(task.priority)} size="sm">
                        {task.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{task.description}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">#{task.orderId}</span>
                      {task.assignee && (
                        <Badge variant="info" size="sm">{task.assignee}</Badge>
                      )}
                    </div>
                    {task.dueDate && (
                      <p className="text-xs text-gray-500 mt-2">
                        Due: {new Date(task.dueDate).toLocaleDateString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
