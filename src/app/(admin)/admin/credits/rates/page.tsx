"use client";

/**
 * Admin Credit Rates Page
 *
 * View and manage AI credit pricing rates:
 * - List all rates by capability and model
 * - Inline editing for rate values
 * - Toggle active status
 *
 * @module app/(admin)/admin/credits/rates/page
 */

import { PageHeader } from "@/components/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { adminApiUrl } from "@/shared/config/urls";
import { Check, Save, Settings, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface CreditRate {
  id: string;
  capability: string;
  model: string;
  creditsPerInputToken: number | null;
  creditsPerOutputToken: number | null;
  creditsPerImage: number | null;
  creditsPerChar: number | null;
  creditsPerMinute: number | null;
  yourCostPerInputToken: number | null;
  yourCostPerOutputToken: number | null;
  yourCostPerImage: number | null;
  yourCostPerChar: number | null;
  yourCostPerMinute: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RatesResponse {
  success: boolean;
  data: {
    rates: CreditRate[];
  };
}

export default function AdminCreditRatesPage() {
  const { token } = useAuth();
  const [rates, setRates] = useState<CreditRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Partial<CreditRate>>({});
  const [saving, setSaving] = useState(false);

  const fetchRates = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(adminApiUrl('/credits/rates'), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch rates');

      const json: RatesResponse = await res.json();
      setRates(json.data.rates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  const startEditing = (rate: CreditRate) => {
    setEditingId(rate.id);
    setEditingValues({
      creditsPerInputToken: rate.creditsPerInputToken,
      creditsPerOutputToken: rate.creditsPerOutputToken,
      creditsPerImage: rate.creditsPerImage,
      creditsPerChar: rate.creditsPerChar,
      creditsPerMinute: rate.creditsPerMinute,
      isActive: rate.isActive,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingValues({});
  };

  const saveRate = async (id: string) => {
    if (!token) return;
    setSaving(true);

    try {
      const res = await fetch(adminApiUrl(`/credits/rates/${id}`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingValues),
      });

      if (!res.ok) throw new Error('Failed to update rate');

      // Refresh rates
      await fetchRates();
      cancelEditing();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save rate');
    } finally {
      setSaving(false);
    }
  };

  const updateEditingValue = (field: keyof CreditRate, value: CreditRate[keyof CreditRate]) => {
    setEditingValues((prev) => ({ ...prev, [field]: value }));
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  // Group rates by capability
  const groupedRates = rates.reduce((acc, rate) => {
    if (!acc[rate.capability]) {
      acc[rate.capability] = [];
    }
    acc[rate.capability]?.push(rate);
    return acc;
  }, {} as Record<string, CreditRate[]>);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Rates"
        description={`Manage AI credit pricing configuration (${rates.length} rates)`}
        icon={<Settings className="h-6 w-6 text-green-500" />}
        breadcrumbs={[{ label: "Credits", href: "/admin/credits" }]}
      />

      {/* Info Card */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardHeader>
          <CardTitle className="text-sm">How Credit Rates Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Credit rates define how many credits are consumed for different AI operations:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong>Input/Output Tokens:</strong> For text generation models</li>
            <li><strong>Images:</strong> For image generation models</li>
            <li><strong>Characters:</strong> For text-to-speech models</li>
            <li><strong>Minutes:</strong> For speech-to-text models</li>
          </ul>
          <p className="pt-2">
            Click a row to edit pricing. Only the relevant fields for each model are used.
          </p>
        </CardContent>
      </Card>

      {/* Rates by Capability */}
      {loading ? (
        <div className="text-center text-muted-foreground py-8">
          Loading rates...
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedRates).map(([capability, capabilityRates]) => (
            <Card key={capability}>
              <CardHeader>
                <CardTitle className="text-lg capitalize">
                  {capability.replace(/-/g, ' ')}
                </CardTitle>
                <CardDescription>
                  {capabilityRates.length} model{capabilityRates.length !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          Model
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                          Input Token
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                          Output Token
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                          Image
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                          Char
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                          Minute
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                          Active
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {capabilityRates.map((rate) => {
                        const isEditing = editingId === rate.id;

                        return (
                          <tr
                            key={rate.id}
                            className={`border-b border-border transition-colors ${
                              isEditing ? 'bg-blue-500/5' : 'hover:bg-muted/50'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="font-medium text-foreground">
                                {rate.model}
                              </div>
                            </td>

                            {/* Input Token */}
                            <td className="py-3 px-4 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  step="0.0001"
                                  value={editingValues.creditsPerInputToken ?? ''}
                                  onChange={(e) =>
                                    updateEditingValue(
                                      'creditsPerInputToken',
                                      e.target.value ? parseFloat(e.target.value) : null
                                    )
                                  }
                                  className="w-24 text-right"
                                />
                              ) : (
                                <span className="text-sm text-foreground">
                                  {rate.creditsPerInputToken ?? '—'}
                                </span>
                              )}
                            </td>

                            {/* Output Token */}
                            <td className="py-3 px-4 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  step="0.0001"
                                  value={editingValues.creditsPerOutputToken ?? ''}
                                  onChange={(e) =>
                                    updateEditingValue(
                                      'creditsPerOutputToken',
                                      e.target.value ? parseFloat(e.target.value) : null
                                    )
                                  }
                                  className="w-24 text-right"
                                />
                              ) : (
                                <span className="text-sm text-foreground">
                                  {rate.creditsPerOutputToken ?? '—'}
                                </span>
                              )}
                            </td>

                            {/* Image */}
                            <td className="py-3 px-4 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editingValues.creditsPerImage ?? ''}
                                  onChange={(e) =>
                                    updateEditingValue(
                                      'creditsPerImage',
                                      e.target.value ? parseFloat(e.target.value) : null
                                    )
                                  }
                                  className="w-24 text-right"
                                />
                              ) : (
                                <span className="text-sm text-foreground">
                                  {rate.creditsPerImage ?? '—'}
                                </span>
                              )}
                            </td>

                            {/* Char */}
                            <td className="py-3 px-4 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  step="0.0001"
                                  value={editingValues.creditsPerChar ?? ''}
                                  onChange={(e) =>
                                    updateEditingValue(
                                      'creditsPerChar',
                                      e.target.value ? parseFloat(e.target.value) : null
                                    )
                                  }
                                  className="w-24 text-right"
                                />
                              ) : (
                                <span className="text-sm text-foreground">
                                  {rate.creditsPerChar ?? '—'}
                                </span>
                              )}
                            </td>

                            {/* Minute */}
                            <td className="py-3 px-4 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editingValues.creditsPerMinute ?? ''}
                                  onChange={(e) =>
                                    updateEditingValue(
                                      'creditsPerMinute',
                                      e.target.value ? parseFloat(e.target.value) : null
                                    )
                                  }
                                  className="w-24 text-right"
                                />
                              ) : (
                                <span className="text-sm text-foreground">
                                  {rate.creditsPerMinute ?? '—'}
                                </span>
                              )}
                            </td>

                            {/* Active Status */}
                            <td className="py-3 px-4 text-center">
                              {isEditing ? (
                                <Switch
                                  checked={editingValues.isActive ?? false}
                                  onCheckedChange={(checked) =>
                                    updateEditingValue('isActive', checked)
                                  }
                                />
                              ) : (
                                <Badge variant={rate.isActive ? 'default' : 'secondary'}>
                                  {rate.isActive ? (
                                    <>
                                      <Check className="h-3 w-3 mr-1" />
                                      Active
                                    </>
                                  ) : (
                                    <>
                                      <X className="h-3 w-3 mr-1" />
                                      Inactive
                                    </>
                                  )}
                                </Badge>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right">
                              {isEditing ? (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => saveRate(rate.id)}
                                    disabled={saving}
                                  >
                                    <Save className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={cancelEditing}
                                    disabled={saving}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditing(rate)}
                                  disabled={!!editingId}
                                >
                                  Edit
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
