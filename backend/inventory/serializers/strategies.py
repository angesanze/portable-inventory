from rest_framework import serializers
from ..models import CalculatorTemplate
from ..engines import EngineFactory

class CalculatorTemplateSerializer(serializers.ModelSerializer):
    """Serializer for CalculatorTemplate model."""
    class Meta:
        model = CalculatorTemplate
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'company']

    def validate(self, attrs):
        engine_type = attrs.get('engine_type', getattr(self.instance, 'engine_type', 'counter'))
        engine_config = attrs.get('engine_config', getattr(self.instance, 'engine_config', {}))
        if engine_config:
            errors = EngineFactory.validate_config(engine_type, engine_config)
            if errors:
                raise serializers.ValidationError({"engine_config": errors})
        return attrs
